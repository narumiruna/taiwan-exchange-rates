#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import type { Exchange, Rate } from "./index.js"
import { banks, cashSpread, exchanges, fetchAllRates, fetchRates, spotSpread } from "./index.js"

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
  fetchAllRates: typeof fetchAllRates
  fetchRates: typeof fetchRates
}>

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  output: Pick<Console, "error" | "log"> = console,
  api: CliApi = { fetchAllRates, fetchRates },
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args: [...argv],
      options: {
        bank: { short: "b", type: "string" },
        help: { short: "h", type: "boolean" },
        json: { type: "boolean" },
        "list-banks": { type: "boolean" },
      },
      strict: true,
    })
  } catch (error) {
    output.error(errorMessage(error))
    output.error("Run `twrate --help` for usage.")
    return 2
  }

  if (parsed.values.help) {
    output.log(helpText)
    return 0
  }
  if (parsed.values["list-banks"]) {
    output.log(banks.map((bank) => `${bank.exchange}\t${bank.nameZhTw}\t${bank.name}`).join("\n"))
    return 0
  }

  const source = parsed.positionals[0]?.trim().toUpperCase()
  if (!source || !/^[A-Z]{3}$/.test(source)) {
    output.error("Currency must be a three-letter code, for example USD.")
    return 2
  }
  if (parsed.positionals.length > 1) {
    output.error("Only one currency may be queried at a time.")
    return 2
  }

  let exchange: Exchange | undefined
  const bankValue = parsed.values.bank
  if (typeof bankValue === "string") {
    exchange = resolveExchange(bankValue)
    if (!exchange) {
      output.error(`Unknown bank: ${bankValue}`)
      output.error("Run `twrate --list-banks` to see supported banks.")
      return 2
    }
  }

  const failures: string[] = []
  try {
    const allRates = exchange
      ? await api.fetchRates(exchange)
      : await api.fetchAllRates({
          onError: (failedExchange, error) => {
            failures.push(`${failedExchange}: ${errorMessage(error)}`)
          },
        })
    const rates = allRates
      .filter((rate) => rate.source === source)
      .sort(
        (left, right) =>
          (spotSpread(left) ?? Number.POSITIVE_INFINITY) -
          (spotSpread(right) ?? Number.POSITIVE_INFINITY),
      )

    for (const failure of failures) output.error(`Warning: ${failure}`)
    if (rates.length === 0) {
      output.error(`No ${source}/TWD rates were returned.`)
      return 1
    }
    output.log(parsed.values.json ? JSON.stringify(rates, null, 2) : formatTable(source, rates))
    return 0
  } catch (error) {
    output.error(errorMessage(error))
    return 1
  }
}

export function resolveExchange(value: string): Exchange | undefined {
  const normalized = value.trim().toUpperCase()
  if ((exchanges as readonly string[]).includes(normalized)) return normalized as Exchange
  return aliases[value.trim().toLowerCase()]
}

function formatTable(source: string, rates: readonly Rate[]): string {
  const rows = rates.map((rate) => {
    const bank = banks.find((item) => item.exchange === rate.exchange)
    return [
      bank?.nameZhTw ?? rate.exchange,
      formatNumber(rate.spotBuy),
      formatNumber(rate.spotSell),
      formatPercent(spotSpread(rate)),
      formatNumber(rate.cashBuy),
      formatNumber(rate.cashSell),
      formatPercent(cashSpread(rate)),
    ]
  })
  return [
    `${source}/TWD 各行即時牌價`,
    ["銀行", "即期買進", "即期賣出", "即期點差", "現鈔買進", "現鈔賣出", "現鈔點差"].join("\t"),
    ...rows.map((row) => row.join("\t")),
  ].join("\n")
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(4)
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "-" : `${(value * 100).toFixed(2)}%`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const helpText = `Usage: twrate [options] <currency>

Compare live TWD exchange rates from Taiwanese banks.

Options:
  -b, --bank <bank>  Query one bank (alias or exchange identifier)
      --json         Print normalized rates as JSON
      --list-banks   List supported banks
  -h, --help         Show this help

Examples:
  twrate USD
  twrate JPY --bank bot
  twrate EUR --json`

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli()
}
