import { load } from "cheerio"
import { createRate, hasAnyRate, normalizeCurrencyCode, parseRateNumber } from "./rates.js"
import type { Exchange, Rate } from "./types.js"

export function parseBankOfTaiwanRates(text: string, fetchedAt = new Date()): Rate[] {
  const normalized = text.replace(/^\uFEFF/, "")
  if (/^\s*<!doctype|^\s*<html/i.test(normalized)) {
    throw new Error("Bank of Taiwan returned an anti-bot challenge instead of rates")
  }
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim())
  const header = lines[0]
  if (!header) {
    throw new Error("Bank of Taiwan rate response is empty")
  }
  const columns = splitColumns(header)
  if (
    columns.length < 14 ||
    columns[0] !== "幣別" ||
    columns[2] !== "現金" ||
    columns[3] !== "即期" ||
    columns[12] !== "現金" ||
    columns[13] !== "即期"
  ) {
    throw new Error("Unexpected Bank of Taiwan rate header")
  }

  const rates = lines.slice(1).map((line) => {
    const row = splitColumns(line)
    if (row.length < 14 || row[1] !== "本行買入" || row[11] !== "本行賣出") {
      throw new Error("Unexpected Bank of Taiwan rate row")
    }
    return createRate(
      "BANK_OF_TAIWAN",
      row[0],
      {
        cashBuy: parseRateNumber(row[2]),
        cashSell: parseRateNumber(row[12]),
        spotBuy: parseRateNumber(row[3]),
        spotSell: parseRateNumber(row[13]),
      },
      fetchedAt,
    )
  })
  return requireRates(rates, "No Bank of Taiwan exchange rates were returned")
}

export function parseSinopacRates(
  remitPayload: unknown,
  cashPayload: unknown,
  fetchedAt = new Date(),
): Rate[] {
  const rates = new Map<string, Rate>()
  for (const [kind, payload] of [
    ["spot", remitPayload],
    ["cash", cashPayload],
  ] as const) {
    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new Error("Unexpected SinoPac exchange-rate response")
    }
    const response = requireRecord(payload[0], "Unexpected SinoPac exchange-rate response")
    if (response.Header !== "SUCCESS" || !Array.isArray(response.SubInfo)) {
      throw new Error("SinoPac exchange-rate response was not successful")
    }
    for (const raw of response.SubInfo) {
      const item = requireRecord(raw, "Unexpected SinoPac exchange-rate row")
      const source = normalizeCurrencyCode(item.DataValue4)
      if (!source) continue
      const buy = parseRateNumber(item.DataValue2)
      const sell = parseRateNumber(item.DataValue3)
      if (buy === undefined && sell === undefined) continue
      const previous = rates.get(source)
      rates.set(
        source,
        createRate(
          "BANK_SINOPAC",
          source,
          {
            cashBuy: kind === "cash" ? buy : previous?.cashBuy,
            cashSell: kind === "cash" ? sell : previous?.cashSell,
            spotBuy: kind === "spot" ? buy : previous?.spotBuy,
            spotSell: kind === "spot" ? sell : previous?.spotSell,
          },
          fetchedAt,
        ),
      )
    }
  }
  return requireRates([...rates.values()], "No SinoPac exchange rates were returned")
}

export function parseDbsRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected DBS exchange-rate response")
  const results = requireRecord(root.results, "Unexpected DBS exchange-rate response")
  if (!Array.isArray(results.assets)) throw new Error("Unexpected DBS exchange-rate response")
  const rates: Rate[] = []
  for (const rawAsset of results.assets) {
    const asset = requireRecord(rawAsset, "Unexpected DBS exchange-rate response")
    if (!Array.isArray(asset.recData)) continue
    for (const raw of asset.recData) {
      const item = requireRecord(raw, "Unexpected DBS exchange-rate row")
      const rate = safeRate("DBS_BANK", item.currency, item, fetchedAt, {
        cashBuy: "cashBuy",
        cashSell: "cashSell",
        spotBuy: "ttBuy",
        spotSell: "ttSell",
      })
      if (rate) rates.push(rate)
    }
  }
  return requireRates(rates, "No DBS Bank rates parsed from API response")
}

export function parseEsunRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected E.SUN Bank response")
  if (!Array.isArray(root.Rates)) throw new Error("Unexpected E.SUN Bank response")
  const rates: Rate[] = []
  for (const raw of root.Rates) {
    const item = requireRecord(raw, "Unexpected E.SUN Bank rate row")
    if (typeof item.CCY !== "string") continue
    const [source, target, extra] = item.CCY.split("/")
    if (extra !== undefined || !normalizeCurrencyCode(source) || !normalizeCurrencyCode(target))
      continue
    const rate = safeRate(
      "ESUN_BANK",
      source,
      item,
      fetchedAt,
      {
        cashBuy: "CashBBoardRate",
        cashSell: "CashSBoardRate",
        spotBuy: "BBoardRate",
        spotSell: "SBoardRate",
      },
      target,
    )
    if (rate) rates.push(rate)
  }
  return requireRates(rates, "No E.SUN Bank rates parsed from API response")
}

export function parseNextBankRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected Next Bank API format")
  const data = requireRecord(root.data, "Unexpected Next Bank API format")
  if (!Array.isArray(data.currencyList)) throw new Error("Unexpected Next Bank API format")
  const rates: Rate[] = []
  for (const raw of data.currencyList) {
    if (!isRecord(raw)) continue
    const rate = safeRate(
      "NEXT_BANK",
      raw.currency,
      {
        spotBuy: raw.sellRate,
        spotSell: raw.buyRate,
      },
      fetchedAt,
      {
        spotBuy: "spotBuy",
        spotSell: "spotSell",
      },
    )
    if (rate) rates.push(rate)
  }
  return requireRates(rates, "No valid Next Bank rates parsed from API response")
}

export function parseMegaBankRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected Mega Bank response")
  if (!Array.isArray(root.rates)) throw new Error("Unexpected Mega Bank response")
  const rates: Rate[] = []
  for (const raw of root.rates) {
    if (!isRecord(raw) || typeof raw.currKey !== "string") continue
    const spot = isRecord(raw.spot) ? raw.spot : {}
    const cash = isRecord(raw.cash) ? raw.cash : {}
    const rate = safeRate(
      "MEGA_BANK",
      raw.currKey.split("|")[0],
      {
        cashBuy: cash.bid,
        cashSell: cash.ask,
        spotBuy: spot.bid,
        spotSell: spot.ask,
      },
      fetchedAt,
      identityKeys,
    )
    if (rate) rates.push(rate)
  }
  return requireRates(rates, "No Mega Bank rates parsed from API response")
}

export function parseTaichungBankRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected Taichung Bank response")
  const body = requireRecord(root.appRepBody, "Unexpected Taichung Bank response")
  if (!Array.isArray(body.exchangeRates)) throw new Error("Unexpected Taichung Bank response")
  const rates: Rate[] = []
  for (const raw of body.exchangeRates) {
    if (!isRecord(raw)) continue
    const spot = isRecord(raw.spotExchangeRate) ? raw.spotExchangeRate : {}
    const cash = isRecord(raw.cashExchangeRate) ? raw.cashExchangeRate : {}
    const rate = safeRate(
      "TAICHUNG_BANK",
      raw.currency,
      {
        cashBuy: cash.buy,
        cashSell: cash.sale,
        spotBuy: spot.buy,
        spotSell: spot.sale,
      },
      fetchedAt,
      identityKeys,
    )
    if (rate) rates.push(rate)
  }
  return requireRates(rates, "No Taichung Bank rates parsed from API response")
}

export function parseFubonRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected Fubon response")
  if (!Array.isArray(root.FE_data)) throw new Error("Unexpected Fubon response")
  const rates: Rate[] = []
  for (const raw of root.FE_data) {
    if (!isRecord(raw)) continue
    const rate = safeRate("FUBON_BANK", raw.currencyEname, raw, fetchedAt, {
      cashBuy: "cash_BUY",
      cashSell: "cash_SELL",
      spotBuy: "Spot_BUY",
      spotSell: "Spot_SELL",
    })
    if (rate) rates.push(rate)
  }
  return requireRates(rates, "No Fubon Bank rates parsed from API response")
}

export function parseCooperativeBankRates(payload: unknown, fetchedAt = new Date()): Rate[] {
  const root = requireRecord(payload, "Unexpected Taiwan Cooperative Bank response")
  if (!Array.isArray(root.result)) throw new Error("Unexpected Taiwan Cooperative Bank response")
  const grouped = new Map<string, Record<string, unknown>>()
  for (const raw of root.result) {
    if (!isRecord(raw)) continue
    const source = normalizeCurrencyCode(raw.Currency)
    if (!source || (raw.Type !== "買入" && raw.Type !== "賣出")) continue
    const values = grouped.get(source) ?? {}
    if (raw.Type === "買入") {
      values.spotBuy = raw.PromptExchange
      values.cashBuy = raw.CashExchange
    } else {
      values.spotSell = raw.PromptExchange
      values.cashSell = raw.CashExchange
    }
    grouped.set(source, values)
  }
  const rates = [...grouped].flatMap(([source, values]) => {
    const rate = safeRate("COOPERATIVE_BANK", source, values, fetchedAt, identityKeys)
    return rate ? [rate] : []
  })
  return requireRates(rates, "No Taiwan Cooperative Bank rates parsed from API response")
}

export function parseLineBankRates(html: string, fetchedAt = new Date()): Rate[] {
  const $ = load(html)
  const rates: Rate[] = []
  $("tbody tr").each((_, row) => {
    const cells = $(row).find("td")
    if (cells.length < 3) return
    const source = $(cells[0])
      .text()
      .toUpperCase()
      .match(/[A-Z]{3}/)?.[0]
    const rate = htmlRate("LINE_BANK", source, [$(cells[1]).text(), $(cells[2]).text()], fetchedAt)
    if (rate) rates.push(rate)
  })
  return requireRates(rates, "No LINE Bank rates parsed from page")
}

export function parseHsbcRates(html: string, fetchedAt = new Date()): Rate[] {
  const $ = load(html)
  const rates: Rate[] = []
  $("table tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().trim())
    if (cells.length < 5) return
    const source = extractParenthesizedCurrency(cells[0] ?? "") ?? normalizeCurrencyCode(cells[0])
    const rate = htmlRate("HSBC_BANK", source, cells.slice(1, 5), fetchedAt)
    if (rate) rates.push(rate)
  })
  return requireRates(rates, "No HSBC Bank rates parsed from page")
}

export function parseKgiRates(html: string, fetchedAt = new Date()): Rate[] {
  const $ = load(html)
  const rates: Rate[] = []
  $(".kgibOtherCus004__item").each((_, row) => {
    const source = normalizeCurrencyCode($(row).find(".currency-en-name").first().text())
    const values = $(row)
      .find(".kgibOtherCus004__item-val span")
      .toArray()
      .map((element) => $(element).text().trim())
      .filter((value) => /^-|\d+(?:\.\d+)?$/.test(value))
    if (values.length < 4) return
    const rate = htmlRate("KGI_BANK", source, values.slice(0, 4), fetchedAt)
    if (rate) rates.push(rate)
  })
  return requireRates(rates, "No KGI Bank rates parsed from page")
}

export function parseCathayRates(html: string, fetchedAt = new Date()): Rate[] {
  const $ = load(html)
  const rates: Rate[] = []
  $(".cubre-o-table__item.currency").each((_, section) => {
    const source = $(section)
      .find(".cubre-m-currency__name")
      .text()
      .match(/[A-Z]{3}/)?.[0]
    const values: Record<string, unknown> = {}
    $(section)
      .find("table tbody tr")
      .each((__, row) => {
        const cells = $(row)
          .find("td")
          .toArray()
          .map((cell) => $(cell).text().trim())
        if (cells.length < 3) return
        if (cells[0]?.includes("即期匯率")) {
          values.spotBuy = cells[1]
          values.spotSell = cells[2]
        } else if (cells[0]?.includes("現鈔匯率")) {
          values.cashBuy = cells[1]
          values.cashSell = cells[2]
        }
      })
    const rate = safeRate("CATHAY_BANK", source, values, fetchedAt, identityKeys)
    if (rate) rates.push(rate)
  })
  return requireRates(rates, "No Cathay United Bank rates parsed from page")
}

export function parseFirstBankRates(html: string, fetchedAt = new Date()): Rate[] {
  const $ = load(html)
  const grouped = new Map<string, Record<string, unknown>>()
  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().trim())
    if (cells.length < 4) return
    const source = extractParenthesizedCurrency(cells[0] ?? "")
    if (!source) return
    const values = grouped.get(source) ?? {}
    if (cells[1]?.includes("即期")) {
      values.spotBuy = cells[2]
      values.spotSell = cells[3]
    } else if (cells[1]?.includes("現鈔")) {
      values.cashBuy = cells[2]
      values.cashSell = cells[3]
    }
    grouped.set(source, values)
  })
  const rates = [...grouped].flatMap(([source, values]) => {
    const rate = safeRate("FIRST_BANK", source, values, fetchedAt, identityKeys)
    return rate ? [rate] : []
  })
  return requireRates(rates, "No First Bank rates parsed from page")
}

export function parseLandBankRates(html: string, fetchedAt = new Date()): Rate[] {
  return parseFiveColumnTable(html, "LAND_BANK", "No Land Bank rates parsed from page", fetchedAt)
}

export function parseYuantaBankRates(html: string, fetchedAt = new Date()): Rate[] {
  return parseFiveColumnTable(
    html,
    "YUANTA_BANK",
    "No Yuanta Bank rates parsed from page",
    fetchedAt,
  )
}

export function parseTaishinRates(script: string, fetchedAt = new Date()): Rate[] {
  const fragments = [...script.matchAll(/document\.writeln\((?:'|")((?:.|\n)*?)(?:'|")\);/g)]
    .map((match) => decodeScriptFragment(match[1] ?? ""))
    .join("")
  const $ = load(fragments)
  const rates = new Map<string, Rate>()
  $("table").each((_, table) => {
    const rows = $(table).children("tbody").children("tr").length
      ? $(table).children("tbody").children("tr")
      : $(table).children("tr")
    const header = rows.first().text().replaceAll(/\s/g, "")
    if (!header.includes("即期買入") || !header.includes("現鈔賣出")) return
    rows.slice(1).each((__, row) => {
      const cells = $(row).children("td")
      if (cells.length < 4) return
      const source = $(row)
        .html()
        ?.match(/queryhistory\('([A-Z]{3})'\)/)?.[1]
      const texts = cells.toArray().map((cell) => $(cell).text().trim())
      const offset =
        texts.length >= 5 &&
        parseRateNumber(texts[0]) === undefined &&
        parseRateNumber(texts[1]) !== undefined
          ? 1
          : 0
      const rate = htmlRate("TAISHIN_BANK", source, texts.slice(offset, offset + 4), fetchedAt)
      if (rate) rates.set(rate.source, rate)
    })
  })
  return requireRates([...rates.values()], "No Taishin Bank rates parsed from page")
}

export function extractCooperativeBankToken(html: string): string {
  const $ = load(html)
  const token = $('form[data-form-id="spotrate"] input[name="__RequestVerificationToken"]')
    .attr("value")
    ?.trim()
  if (!token) throw new Error("Could not find Taiwan Cooperative Bank request token")
  return token
}

function parseFiveColumnTable(
  html: string,
  exchange: Exchange,
  error: string,
  fetchedAt: Date,
): Rate[] {
  const $ = load(html)
  const rates = new Map<string, Rate>()
  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .toArray()
      .map((cell) => $(cell).text().trim())
    if (cells.length < 5) return
    const rate = htmlRate(
      exchange,
      extractParenthesizedCurrency(cells[0] ?? ""),
      cells.slice(1, 5),
      fetchedAt,
    )
    if (rate) rates.set(rate.source, rate)
  })
  return requireRates([...rates.values()], error)
}

function htmlRate(
  exchange: Exchange,
  source: unknown,
  values: readonly unknown[],
  fetchedAt: Date,
): Rate | undefined {
  return safeRate(
    exchange,
    source,
    {
      spotBuy: values[0],
      spotSell: values[1],
      cashBuy: values[2],
      cashSell: values[3],
    },
    fetchedAt,
    identityKeys,
  )
}

const identityKeys = {
  cashBuy: "cashBuy",
  cashSell: "cashSell",
  spotBuy: "spotBuy",
  spotSell: "spotSell",
} as const

type RateKeys = Partial<Record<"cashBuy" | "cashSell" | "spotBuy" | "spotSell", string>>

function safeRate(
  exchange: Exchange,
  source: unknown,
  values: Record<string, unknown>,
  fetchedAt: Date,
  keys: RateKeys,
  target: unknown = "TWD",
): Rate | undefined {
  if (!normalizeCurrencyCode(source) || !normalizeCurrencyCode(target)) return undefined
  const rate = createRate(
    exchange,
    source,
    {
      cashBuy: parseRateNumber(keys.cashBuy ? values[keys.cashBuy] : undefined),
      cashSell: parseRateNumber(keys.cashSell ? values[keys.cashSell] : undefined),
      spotBuy: parseRateNumber(keys.spotBuy ? values[keys.spotBuy] : undefined),
      spotSell: parseRateNumber(keys.spotSell ? values[keys.spotSell] : undefined),
    },
    fetchedAt,
    target,
  )
  return hasAnyRate(rate) ? rate : undefined
}

function extractParenthesizedCurrency(value: string): string | undefined {
  return normalizeCurrencyCode(value.replaceAll(/\s/g, "").match(/\(([A-Z]{3})\)/)?.[1])
}

function decodeScriptFragment(fragment: string): string {
  const normalized = fragment.replaceAll('\\"', '"').replaceAll("\\'", "'").replaceAll("\\/", "/")
  try {
    return JSON.parse(`"${normalized}"`) as string
  } catch {
    return normalized
  }
}

function splitColumns(value: string): string[] {
  return value.split(" ").filter(Boolean)
}

function requireRates(rates: Rate[], message: string): Rate[] {
  if (rates.length === 0) throw new Error(message)
  return rates
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
