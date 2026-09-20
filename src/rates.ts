import type { Exchange, Rate } from "./types.js"

const currencyCodePattern = /^[A-Z]{3}$/
const missingValues = new Set(["", "-", "--", "—", "N/A", "NA", "NULL"])

export function normalizeCurrencyCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const code = value.trim().toUpperCase()
  return currencyCodePattern.test(code) ? code : undefined
}

export function parseRateNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === "boolean") {
    return undefined
  }

  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value
  if (typeof normalized === "string" && missingValues.has(normalized.toUpperCase())) {
    return undefined
  }
  if (typeof normalized !== "string" && typeof normalized !== "number") {
    return undefined
  }

  const number = Number(normalized)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function createRate(
  exchange: Exchange,
  sourceValue: unknown,
  values: Pick<Rate, "cashBuy" | "cashSell" | "spotBuy" | "spotSell">,
  fetchedAt: Date | string,
  targetValue: unknown = "TWD",
): Rate {
  const source = normalizeCurrencyCode(sourceValue)
  const target = normalizeCurrencyCode(targetValue)
  if (!source || !target) {
    throw new Error("Exchange-rate currencies must be three-letter codes")
  }

  const spotBuy = parseRateNumber(values.spotBuy)
  const spotSell = parseRateNumber(values.spotSell)
  const cashBuy = parseRateNumber(values.cashBuy)
  const cashSell = parseRateNumber(values.cashSell)
  return {
    exchange,
    fetchedAt: typeof fetchedAt === "string" ? fetchedAt : fetchedAt.toISOString(),
    source,
    target,
    ...(spotBuy === undefined ? {} : { spotBuy }),
    ...(spotSell === undefined ? {} : { spotSell }),
    ...(cashBuy === undefined ? {} : { cashBuy }),
    ...(cashSell === undefined ? {} : { cashSell }),
  }
}

export function hasAnyRate(rate: Rate): boolean {
  return [rate.spotBuy, rate.spotSell, rate.cashBuy, rate.cashSell].some(
    (value) => value !== undefined,
  )
}

export function spotMid(rate: Rate): number | undefined {
  return mid(rate.spotBuy, rate.spotSell)
}

export function cashMid(rate: Rate): number | undefined {
  return mid(rate.cashBuy, rate.cashSell)
}

export function spotSpread(rate: Rate): number | undefined {
  return spread(rate.spotBuy, rate.spotSell)
}

export function cashSpread(rate: Rate): number | undefined {
  return spread(rate.cashBuy, rate.cashSell)
}

export function symbol(rate: Rate): string {
  return `${rate.source}/${rate.target}`
}

function mid(buy: number | undefined, sell: number | undefined): number | undefined {
  if (buy === undefined || sell === undefined) {
    return undefined
  }
  return (buy + sell) / 2
}

function spread(buy: number | undefined, sell: number | undefined): number | undefined {
  const midpoint = mid(buy, sell)
  if (buy === undefined || sell === undefined || midpoint === undefined || midpoint <= 0) {
    return undefined
  }
  return (sell - buy) / midpoint
}
