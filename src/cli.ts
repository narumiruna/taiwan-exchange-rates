#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { appendHistory, createHistoryRecord, readHistory } from "./history.js"
import type {
  CustomerAction,
  Exchange,
  FetchAllRatesOptions,
  FetchRatesOptions,
  Rate,
  RateType,
} from "./index.js"
import {
  banks,
  createRateClient,
  evaluateAlert,
  exchanges,
  fetchAllRates,
  fetchRates,
  queryRates,
} from "./index.js"
import { formatRates, type OutputFormat } from "./output.js"

const aliases: Readonly<Record<string, Exchange>> = {
  bot: "BANK_OF_TAIWAN",
  cathay: "CATHAY_BANK",
  cooperative: "COOPERATIVE_BANK",
  dbs: "DBS_BANK",
  esun: "ESUN_BANK",
  first: "FIRST_BANK",
  firstbank: "FIRST_BANK",
  fubon: "FUBON_BANK",
  hsbc: "HSBC_BANK",
  kgi: "KGI_BANK",
  land: "LAND_BANK",
  landbank: "LAND_BANK",
  line: "LINE_BANK",
  mega: "MEGA_BANK",
  megabank: "MEGA_BANK",
  next: "NEXT_BANK",
  sinopac: "BANK_SINOPAC",
  taichung: "TAICHUNG_BANK",
  taishin: "TAISHIN_BANK",
  tcb: "COOPERATIVE_BANK",
  yuanta: "YUANTA_BANK",
}

type CliApi = Readonly<{
  fetchAllRates: (options?: FetchAllRatesOptions) => Promise<readonly Rate[]>
  fetchRates: (exchange?: Exchange, options?: FetchRatesOptions) => Promise<readonly Rate[]>
}>

type Output = Pick<Console, "error" | "log">
type Values = ReturnType<typeof parseCliArgs>["values"]

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  output: Output = console,
  injectedApi?: CliApi,
): Promise<number> {
  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(argv)
  } catch (error) {
    output.error(errorMessage(error))
    output.error("Run `twrate --help` for usage.")
    return 2
  }

  if (parsed.values.help) {
    output.log(helpText)
    return 0
  }

  let settings: CliSettings
  try {
    settings = parseSettings(parsed.values)
  } catch (error) {
    output.error(errorMessage(error))
    return 2
  }
  const api = injectedApi ?? createCliApi(settings)
  const command = commandFrom(parsed.positionals)
  const positionals = command === "rates" ? parsed.positionals : parsed.positionals.slice(1)

  try {
    if (parsed.values["list-banks"]) return listBanks(settings.format, output)
    if (parsed.values["list-currencies"]) {
      return await listCurrencies(parsed.values.bank, settings, output, api)
    }
    if (command === "history") return await runHistory(positionals, parsed.values, settings, output)
    if (command === "alert")
      return await runAlert(positionals, parsed.values, settings, output, api)
    if (command === "serve") return await runServe(positionals, parsed.values, settings, output)
    return await runRates(positionals, parsed.values, settings, output, api)
  } catch (error) {
    output.error(errorMessage(error))
    return error instanceof UsageError || error instanceof RangeError ? 2 : 1
  }
}

export function resolveExchange(value: string): Exchange | undefined {
  const normalized = value.trim().toUpperCase()
  if ((exchanges as readonly string[]).includes(normalized)) return normalized as Exchange
  return aliases[value.trim().toLowerCase()]
}

type CliSettings = Readonly<{
  action?: CustomerAction
  cacheTtlMs: number
  format: OutputFormat
  maxConcurrency?: number
  minStartIntervalMs: number
  rateType: RateType
  sort: "price" | "spread"
  timeoutMs: number
  top?: number
}>

function parseCliArgs(argv: readonly string[]) {
  return parseArgs({
    allowPositionals: true,
    args: [...argv],
    options: {
      action: { type: "string" },
      "at-or-above": { type: "string" },
      "at-or-below": { type: "string" },
      bank: { short: "b", type: "string" },
      "cache-ttl": { type: "string" },
      format: { type: "string" },
      help: { short: "h", type: "boolean" },
      "history-file": { type: "string" },
      host: { type: "string" },
      json: { type: "boolean" },
      limit: { type: "string" },
      "list-banks": { type: "boolean" },
      "list-currencies": { type: "boolean" },
      "max-concurrency": { type: "string" },
      "min-start-interval": { type: "string" },
      port: { type: "string" },
      since: { type: "string" },
      sort: { type: "string" },
      timeout: { type: "string" },
      top: { type: "string" },
      type: { type: "string" },
      until: { type: "string" },
    },
    strict: true,
  })
}

function parseSettings(values: Values): CliSettings {
  const action = optionalChoice(values.action, ["buy", "sell"] as const, "action")
  const rateType = optionalChoice(values.type, ["spot", "cash"] as const, "type") ?? "spot"
  const requestedSort = optionalChoice(values.sort, ["price", "spread"] as const, "sort")
  const sort = requestedSort ?? (action ? "price" : "spread")
  if (sort === "price" && !action) usage("--sort price requires --action buy|sell")
  const formatValue = optionalChoice(values.format, ["table", "json", "csv"] as const, "format")
  if (values.json && formatValue && formatValue !== "json") {
    usage("--json cannot be combined with a non-JSON --format")
  }
  return {
    ...(action ? { action } : {}),
    cacheTtlMs: optionalNumber(values["cache-ttl"], "cache-ttl", 0, true) ?? 0,
    format: values.json ? "json" : (formatValue ?? "table"),
    maxConcurrency: optionalInteger(values["max-concurrency"], "max-concurrency", 1),
    minStartIntervalMs:
      optionalNumber(values["min-start-interval"], "min-start-interval", 0, true) ?? 0,
    rateType,
    sort,
    timeoutMs: optionalNumber(values.timeout, "timeout", 0, false) ?? 30_000,
    top: optionalInteger(values.top, "top", 1),
  }
}

function createCliApi(settings: CliSettings): CliApi {
  const usesClient =
    settings.cacheTtlMs > 0 ||
    settings.maxConcurrency !== undefined ||
    settings.minStartIntervalMs > 0
  if (!usesClient) return { fetchAllRates, fetchRates }
  const client = createRateClient({
    cacheTtlMs: settings.cacheTtlMs,
    maxConcurrency: settings.maxConcurrency,
    minStartIntervalMs: settings.minStartIntervalMs,
    timeoutMs: settings.timeoutMs,
  })
  return {
    fetchAllRates: (options = {}) => client.fetchAllRates(options),
    fetchRates: (exchange) => client.fetchRates(exchange),
  }
}

async function runRates(
  positionals: readonly string[],
  values: Values,
  settings: CliSettings,
  output: Output,
  api: CliApi,
): Promise<number> {
  const currencies = parseCurrencies(positionals)
  const exchange = parseExchange(values.bank)
  const { failures, rates } = await loadRates(exchange, settings.timeoutMs, api)
  for (const failure of failures) output.error(`Warning: ${failure}`)
  const filtered = rates.filter((rate) => currencies.includes(rate.source))
  if (filtered.length === 0) {
    output.error(`No ${currencies.join(", ")}/TWD rates were returned.`)
    return 1
  }
  const selected = queryRates(filtered, {
    action: settings.action,
    currencies,
    rateType: settings.rateType,
    sort: settings.sort,
    top: settings.top,
  })
  if (selected.length === 0) {
    output.error(`No ${currencies.join(", ")}/TWD rates matched the requested ranking.`)
    return 1
  }
  output.log(formatRates(selected, settings.format, settings))
  if (typeof values["history-file"] === "string") {
    await appendHistory(
      values["history-file"],
      createHistoryRecord(filtered, {
        exchanges: exchange ? [exchange] : exchanges,
        requestedCurrencies: currencies,
      }),
    )
  }
  return 0
}

async function runHistory(
  positionals: readonly string[],
  values: Values,
  settings: CliSettings,
  output: Output,
): Promise<number> {
  const path = requiredString(values["history-file"], "history requires --history-file")
  const currencies = positionals.length > 0 ? parseCurrencies(positionals) : undefined
  const exchange = values.bank ? parseExchange(values.bank) : undefined
  const records = await readHistory(path, {
    currencies,
    exchanges: exchange ? [exchange] : undefined,
    limit: optionalInteger(values.limit, "limit", 1),
    since: values.since,
    until: values.until,
  })
  if (settings.format === "json") output.log(JSON.stringify(records, null, 2))
  else
    output.log(
      formatRates(
        records.flatMap((record) => record.rates),
        settings.format,
        settings,
      ),
    )
  return 0
}

async function runAlert(
  positionals: readonly string[],
  values: Values,
  settings: CliSettings,
  output: Output,
  api: CliApi,
): Promise<number> {
  const currencies = parseCurrencies(positionals)
  if (currencies.length !== 1) usage("alert requires exactly one currency")
  if (!settings.action) usage("alert requires --action buy|sell")
  const atOrAbove = optionalNumber(values["at-or-above"], "at-or-above", 0, false)
  const atOrBelow = optionalNumber(values["at-or-below"], "at-or-below", 0, false)
  if (settings.action === "buy" && (atOrBelow === undefined || atOrAbove !== undefined)) {
    usage("buy alerts require only --at-or-below")
  }
  if (settings.action === "sell" && (atOrAbove === undefined || atOrBelow !== undefined)) {
    usage("sell alerts require only --at-or-above")
  }
  const alertOptions = {
    action: settings.action,
    atOrAbove,
    atOrBelow,
    rateType: settings.rateType,
  } as const
  const exchange = parseExchange(values.bank)
  const { failures, rates } = await loadRates(exchange, settings.timeoutMs, api)
  for (const failure of failures) output.error(`Warning: ${failure}`)
  const result = evaluateAlert(
    rates.filter((rate) => rate.source === currencies[0]),
    alertOptions,
  )
  output.log(
    settings.format === "json"
      ? JSON.stringify(result, null, 2)
      : result.price === undefined
        ? `No executable ${settings.rateType} quote was returned.`
        : `${result.triggered ? "ALERT" : "NOT MET"}: ${currencies[0]}/TWD ${result.price} (${result.rate?.exchange})`,
  )
  return result.triggered ? 0 : 1
}

async function runServe(
  positionals: readonly string[],
  values: Values,
  settings: CliSettings,
  output: Output,
): Promise<number> {
  if (positionals.length > 0) usage("serve does not accept currencies")
  const { startServer } = await import("./server.js")
  const running = await startServer({
    cacheTtlMs: settings.cacheTtlMs,
    historyFile: values["history-file"],
    host: values.host,
    maxConcurrency: settings.maxConcurrency,
    minStartIntervalMs: settings.minStartIntervalMs,
    port: optionalInteger(values.port, "port", 0, 0) ?? 3000,
    timeoutMs: settings.timeoutMs,
  })
  output.log(`twrate server listening on ${running.url}`)
  const stop = () => {
    void running.close().catch((error) => output.error(errorMessage(error)))
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    await running.closed
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
  return 0
}

async function listCurrencies(
  bankValue: string | undefined,
  settings: CliSettings,
  output: Output,
  api: CliApi,
): Promise<number> {
  const exchange = bankValue ? parseExchange(bankValue) : undefined
  const { failures, rates } = await loadRates(exchange, settings.timeoutMs, api)
  for (const failure of failures) output.error(`Warning: ${failure}`)
  const rows = [...new Set(rates.map((rate) => `${rate.exchange}\t${rate.source}`))]
    .sort()
    .reduce<Record<string, string[]>>((result, row) => {
      const [itemExchange, currency] = row.split("\t") as [string, string]
      const currencies = result[itemExchange] ?? []
      currencies.push(currency)
      result[itemExchange] = currencies
      return result
    }, {})
  output.log(
    settings.format === "json"
      ? JSON.stringify(rows, null, 2)
      : Object.entries(rows)
          .map(([itemExchange, currencies]) => `${itemExchange}\t${currencies.join(",")}`)
          .join("\n"),
  )
  return Object.keys(rows).length > 0 ? 0 : 1
}

function listBanks(format: OutputFormat, output: Output): number {
  if (format === "json") output.log(JSON.stringify(banks, null, 2))
  else if (format === "csv") {
    output.log(
      [
        "exchange,nameZhTw,name,sourceKind,rateTypes,rateUrl",
        ...banks.map((bank) =>
          [
            bank.exchange,
            bank.nameZhTw,
            bank.name,
            bank.sourceKind,
            bank.rateTypes.join("+"),
            bank.rateUrl,
          ].join(","),
        ),
      ].join("\r\n"),
    )
  } else {
    output.log(banks.map((bank) => `${bank.exchange}\t${bank.nameZhTw}\t${bank.name}`).join("\n"))
  }
  return 0
}

async function loadRates(
  exchange: Exchange | undefined,
  timeoutMs: number,
  api: CliApi,
): Promise<{ failures: string[]; rates: readonly Rate[] }> {
  const failures: string[] = []
  const rates = exchange
    ? await api.fetchRates(exchange, { timeoutMs })
    : await api.fetchAllRates({
        onError: (failedExchange, error) => {
          failures.push(`${failedExchange}: ${errorMessage(error)}`)
        },
        timeoutMs,
      })
  return { failures, rates }
}

function commandFrom(positionals: readonly string[]): "alert" | "history" | "rates" | "serve" {
  const first = positionals[0]
  return first === "alert" || first === "history" || first === "serve" ? first : "rates"
}

function parseCurrencies(values: readonly string[]): string[] {
  if (values.length === 0) usage("Currency must be a three-letter code, for example USD.")
  const currencies = values.map((value) => value.trim().toUpperCase())
  if (currencies.some((currency) => !/^[A-Z]{3}$/.test(currency))) {
    usage("Currency must be a three-letter code, for example USD.")
  }
  return [...new Set(currencies)]
}

function parseExchange(value: string | undefined): Exchange | undefined {
  if (value === undefined) return undefined
  const exchange = resolveExchange(value)
  if (!exchange) usage(`Unknown bank: ${value}. Run \`twrate --list-banks\` for choices.`)
  return exchange
}

function optionalChoice<const T extends readonly string[]>(
  value: string | undefined,
  choices: T,
  name: string,
): T[number] | undefined {
  if (value === undefined) return undefined
  if (!(choices as readonly string[]).includes(value)) {
    usage(`--${name} must be one of: ${choices.join(", ")}`)
  }
  return value as T[number]
}

function optionalNumber(
  value: string | undefined,
  name: string,
  minimum: number,
  inclusive: boolean,
): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  const valid = Number.isFinite(number) && (inclusive ? number >= minimum : number > minimum)
  if (!valid) {
    usage(`--${name} must be ${inclusive ? "at least" : "greater than"} ${minimum}`)
  }
  return number
}

function optionalInteger(
  value: string | undefined,
  name: string,
  minimum: number,
  fallbackMinimum = minimum,
): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < fallbackMinimum) {
    usage(`--${name} must be an integer of at least ${fallbackMinimum}`)
  }
  return number
}

function requiredString(value: string | undefined, message: string): string {
  if (!value?.trim()) usage(message)
  return value
}

class UsageError extends Error {}

function usage(message: string): never {
  throw new UsageError(message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const helpText = `Usage: twrate [options] <currency...>
       twrate history [currency...] --history-file <path>
       twrate alert <currency> --action buy|sell --at-or-below|--at-or-above <rate>
       twrate serve [options]

Compare live TWD exchange rates from Taiwanese banks.
Actions are from the customer perspective: buy uses the bank sell rate; sell uses bank buy.

Options:
  -b, --bank <bank>             Query one bank (alias or exchange identifier)
      --action <buy|sell>       Rank for a customer buying or selling foreign currency
      --type <spot|cash>        Select quote type (default: spot)
      --sort <price|spread>     Sort each currency group
      --top <n>                 Keep the top N banks per currency
      --format <table|json|csv> Output format (default: table)
      --json                    Compatibility alias for --format json
      --timeout <ms>            Per-request timeout (default: 30000)
      --cache-ttl <ms>          In-process successful-result cache duration
      --max-concurrency <n>     Maximum concurrent bank providers
      --min-start-interval <ms> Minimum delay between provider starts
      --history-file <path>     Append/read versioned JSONL history
      --list-banks              List supported banks and metadata
      --list-currencies         Discover currencies from current bank responses
  -h, --help                    Show this help

Examples:
  twrate USD
  twrate USD JPY --action buy --type spot --top 5
  twrate EUR --bank esun --format json
  twrate USD --format csv --history-file ./rates.jsonl
  twrate alert USD --action buy --at-or-below 31.5
  twrate serve --port 3000 --cache-ttl 60000`

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli()
}
