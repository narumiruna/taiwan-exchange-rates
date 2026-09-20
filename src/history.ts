import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Exchange, Rate } from "./types.js"
import { exchanges } from "./types.js"

export type HistoryRecord = Readonly<{
  exchanges: readonly Exchange[]
  rates: readonly Rate[]
  recordedAt: string
  requestedCurrencies: readonly string[]
  version: 1
}>

export type CreateHistoryRecordOptions = Readonly<{
  exchanges?: readonly Exchange[]
  now?: () => Date
  requestedCurrencies?: readonly string[]
}>

export type ReadHistoryOptions = Readonly<{
  currencies?: readonly string[]
  exchanges?: readonly Exchange[]
  limit?: number
  since?: Date | string
  until?: Date | string
}>

export class HistoryQueryError extends RangeError {}

export function createHistoryRecord(
  rates: readonly Rate[],
  options: CreateHistoryRecordOptions = {},
): HistoryRecord {
  return {
    exchanges: [...(options.exchanges ?? unique(rates.map((rate) => rate.exchange)))],
    rates: rates.map((rate) => ({ ...rate })),
    recordedAt: (options.now ?? (() => new Date()))().toISOString(),
    requestedCurrencies: [
      ...(options.requestedCurrencies ?? unique(rates.map((rate) => rate.source))),
    ],
    version: 1,
  }
}

export async function appendHistory(path: string, record: HistoryRecord): Promise<void> {
  validateRecord(record, 1)
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8")
}

export async function readHistory(
  path: string,
  options: ReadHistoryOptions = {},
): Promise<HistoryRecord[]> {
  const limit = options.limit ?? 100
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new HistoryQueryError("History limit must be an integer from 1 to 10000")
  }
  const since = parseBoundary(options.since, "since")
  const until = parseBoundary(options.until, "until")
  if (since !== undefined && until !== undefined && since > until) {
    throw new HistoryQueryError("History since must not be after until")
  }

  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }

  const selectedCurrencies = options.currencies
    ? new Set(options.currencies.map((currency) => currency.toUpperCase()))
    : undefined
  const selectedExchanges = options.exchanges ? new Set(options.exchanges) : undefined
  const records: HistoryRecord[] = []
  const lines = content.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`Invalid history record on line ${index + 1}: malformed JSON`)
    }
    const record = validateRecord(value, index + 1)
    const timestamp = Date.parse(record.recordedAt)
    if (since !== undefined && timestamp < since) continue
    if (until !== undefined && timestamp > until) continue
    const rates = record.rates.filter(
      (rate) =>
        (!selectedCurrencies || selectedCurrencies.has(rate.source)) &&
        (!selectedExchanges || selectedExchanges.has(rate.exchange)),
    )
    if (rates.length === 0 && (selectedCurrencies || selectedExchanges)) continue
    records.push({ ...record, rates })
  }
  return records.slice(-limit)
}

function validateRecord(value: unknown, line: number): HistoryRecord {
  if (!isRecord(value) || value.version !== 1) return invalid(line, "unsupported schema")
  if (!validIso(value.recordedAt)) return invalid(line, "invalid recordedAt")
  if (!Array.isArray(value.exchanges) || !value.exchanges.every(isExchange)) {
    return invalid(line, "invalid exchanges")
  }
  if (
    !Array.isArray(value.requestedCurrencies) ||
    !value.requestedCurrencies.every((currency) =>
      typeof currency === "string" ? /^[A-Z]{3}$/.test(currency) : false,
    )
  ) {
    return invalid(line, "invalid requestedCurrencies")
  }
  if (!Array.isArray(value.rates) || !value.rates.every(isRate)) {
    return invalid(line, "invalid rates")
  }
  return value as HistoryRecord
}

function isRate(value: unknown): value is Rate {
  if (!isRecord(value)) return false
  if (!isExchange(value.exchange)) return false
  if (!validIso(value.fetchedAt)) return false
  if (typeof value.source !== "string" || !/^[A-Z]{3}$/.test(value.source)) return false
  if (typeof value.target !== "string" || !/^[A-Z]{3}$/.test(value.target)) return false
  const values = [value.spotBuy, value.spotSell, value.cashBuy, value.cashSell]
  return (
    values.some((item) => item !== undefined) &&
    values.every(
      (item) =>
        item === undefined || (typeof item === "number" && Number.isFinite(item) && item > 0),
    )
  )
}

function isExchange(value: unknown): value is Exchange {
  return typeof value === "string" && (exchanges as readonly string[]).includes(value)
}

function parseBoundary(value: Date | string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp))
    throw new HistoryQueryError(`History ${name} must be a valid date`)
  return timestamp
}

function validIso(value: unknown): value is string {
  if (typeof value !== "string") return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalid(line: number, reason: string): never {
  throw new Error(`Invalid history record on line ${line}: ${reason}`)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
