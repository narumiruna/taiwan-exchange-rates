import { cashSpread, spotSpread } from "./rates.js"
import type { Rate, RateType } from "./types.js"

export type CustomerAction = "buy" | "sell"
export type RateSort = "price" | "spread"
export type RateField = "cashBuy" | "cashSell" | "spotBuy" | "spotSell"

export type QueryRatesOptions = Readonly<{
  action?: CustomerAction
  currencies?: readonly string[]
  rateType?: RateType
  sort?: RateSort
  top?: number
}>

export function rateField(action: CustomerAction, rateType: RateType = "spot"): RateField {
  if (rateType === "cash") return action === "buy" ? "cashSell" : "cashBuy"
  return action === "buy" ? "spotSell" : "spotBuy"
}

export function executablePrice(
  rate: Rate,
  action: CustomerAction,
  rateType: RateType = "spot",
): number | undefined {
  return rate[rateField(action, rateType)]
}

export function filterRates(rates: readonly Rate[], currencies?: readonly string[]): Rate[] {
  if (!currencies || currencies.length === 0) return [...rates]
  const selected = new Set(currencies.map((currency) => currency.toUpperCase()))
  return rates.filter((rate) => selected.has(rate.source))
}

export function groupRates(rates: readonly Rate[]): ReadonlyMap<string, Rate[]> {
  const groups = new Map<string, Rate[]>()
  for (const rate of rates) {
    const group = groups.get(rate.source) ?? []
    group.push(rate)
    groups.set(rate.source, group)
  }
  return groups
}

export function sortRates(
  rates: readonly Rate[],
  options: Pick<QueryRatesOptions, "action" | "rateType" | "sort"> = {},
): Rate[] {
  const rateType = options.rateType ?? "spot"
  const sort = options.sort ?? "spread"
  return [...rates].sort((left, right) => {
    const leftValue = sortableValue(left, sort, options.action, rateType)
    const rightValue = sortableValue(right, sort, options.action, rateType)
    if (leftValue === undefined && rightValue !== undefined) return 1
    if (leftValue !== undefined && rightValue === undefined) return -1
    if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
      const direction = sort === "price" && options.action === "sell" ? -1 : 1
      return (leftValue - rightValue) * direction
    }
    return left.exchange.localeCompare(right.exchange)
  })
}

export function queryRates(rates: readonly Rate[], options: QueryRatesOptions = {}): Rate[] {
  const sort = options.sort ?? "spread"
  const rateType = options.rateType ?? "spot"
  if (sort === "price" && !options.action) {
    throw new RangeError("Price sorting requires a customer action")
  }
  if (options.top !== undefined && (!Number.isSafeInteger(options.top) || options.top < 1)) {
    throw new RangeError("top must be a positive integer")
  }
  const filtered = filterRates(rates, options.currencies)
  const groups = groupRates(filtered)
  const order = options.currencies
    ? [...new Set(options.currencies.map((currency) => currency.toUpperCase()))]
    : [...groups.keys()]
  const result: Rate[] = []
  for (const currency of order) {
    const group = groups.get(currency)
    if (!group) continue
    const sorted = sortRates(group, options)
    const ranked =
      sort === "price" || options.top !== undefined
        ? sorted.filter((rate) => sortableValue(rate, sort, options.action, rateType) !== undefined)
        : sorted
    result.push(...(options.top === undefined ? ranked : ranked.slice(0, options.top)))
  }
  return result
}

export function bestRate(
  rates: readonly Rate[],
  action: CustomerAction,
  rateType: RateType = "spot",
): Rate | undefined {
  return sortRates(
    rates.filter((rate) => executablePrice(rate, action, rateType) !== undefined),
    { action, rateType, sort: "price" },
  )[0]
}

function sortableValue(
  rate: Rate,
  sort: RateSort,
  action: CustomerAction | undefined,
  rateType: RateType,
): number | undefined {
  if (sort === "price") return action ? executablePrice(rate, action, rateType) : undefined
  return rateType === "cash" ? cashSpread(rate) : spotSpread(rate)
}
