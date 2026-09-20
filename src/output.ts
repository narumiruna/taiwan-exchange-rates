import type { CustomerAction } from "./query.js"
import { groupRates } from "./query.js"
import { cashSpread, spotSpread } from "./rates.js"
import { banks, type Rate, type RateType } from "./types.js"

export type OutputFormat = "csv" | "json" | "table"

export type FormatRatesOptions = Readonly<{
  action?: CustomerAction
  rateType?: RateType
}>

export function formatRates(
  rates: readonly Rate[],
  format: OutputFormat,
  options: FormatRatesOptions = {},
): string {
  if (format === "json") return JSON.stringify(rates, null, 2)
  if (format === "csv") return formatCsv(rates)
  return [...groupRates(rates)]
    .map(([source, group]) => formatTable(source, group, options))
    .join("\n\n")
}

export function formatCsv(rates: readonly Rate[]): string {
  const rows = rates.map((rate) => {
    const bank = banks.find((item) => item.exchange === rate.exchange)
    return [
      rate.source,
      rate.target,
      rate.exchange,
      bank?.nameZhTw ?? "",
      rate.spotBuy,
      rate.spotSell,
      spotSpread(rate),
      rate.cashBuy,
      rate.cashSell,
      cashSpread(rate),
      rate.fetchedAt,
    ]
  })
  return [
    [
      "source",
      "target",
      "exchange",
      "bank",
      "spotBuy",
      "spotSell",
      "spotSpread",
      "cashBuy",
      "cashSell",
      "cashSpread",
      "fetchedAt",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
}

function formatTable(source: string, rates: readonly Rate[], options: FormatRatesOptions): string {
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
  const intent = options.action
    ? `（顧客${options.action === "buy" ? "買入" : "賣出"}${options.rateType === "cash" ? "現鈔" : "即期"}）`
    : ""
  return [
    `${source}/TWD 各行即時牌價${intent}`,
    ["銀行", "即期買進", "即期賣出", "即期點差", "現鈔買進", "現鈔賣出", "現鈔點差"].join("\t"),
    ...rows.map((row) => row.join("\t")),
  ].join("\n")
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return ""
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(4)
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "-" : `${(value * 100).toFixed(2)}%`
}
