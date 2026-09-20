import type { CustomerAction } from "./query.js"
import { bestRate, executablePrice } from "./query.js"
import type { Rate, RateType } from "./types.js"

export type AlertOptions = Readonly<{
  action: CustomerAction
  atOrAbove?: number
  atOrBelow?: number
  rateType?: RateType
}>

export type AlertResult = Readonly<{
  action: CustomerAction
  price?: number
  rate?: Rate
  rateType: RateType
  threshold: number
  triggered: boolean
}>

export function evaluateAlert(rates: readonly Rate[], options: AlertOptions): AlertResult {
  const rateType = options.rateType ?? "spot"
  const threshold = alertThreshold(options)
  const rate = bestRate(rates, options.action, rateType)
  const price = rate ? executablePrice(rate, options.action, rateType) : undefined
  const triggered =
    price !== undefined && (options.action === "buy" ? price <= threshold : price >= threshold)
  return {
    action: options.action,
    ...(price === undefined ? {} : { price }),
    ...(rate ? { rate } : {}),
    rateType,
    threshold,
    triggered,
  }
}

function alertThreshold(options: AlertOptions): number {
  const expected = options.action === "buy" ? options.atOrBelow : options.atOrAbove
  const unexpected = options.action === "buy" ? options.atOrAbove : options.atOrBelow
  if (unexpected !== undefined || expected === undefined) {
    throw new RangeError(
      options.action === "buy"
        ? "Buy alerts require only atOrBelow"
        : "Sell alerts require only atOrAbove",
    )
  }
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new RangeError("Alert threshold must be a positive number")
  }
  return expected
}
