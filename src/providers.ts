import { Impit } from "impit"
import {
  extractCooperativeBankToken,
  parseBankOfTaiwanRates,
  parseCathayRates,
  parseCooperativeBankRates,
  parseDbsRates,
  parseEsunRates,
  parseFirstBankRates,
  parseFubonRates,
  parseHsbcRates,
  parseKgiRates,
  parseLandBankRates,
  parseLineBankRates,
  parseMegaBankRates,
  parseNextBankRates,
  parseSinopacRates,
  parseTaichungBankRates,
  parseTaishinRates,
  parseYuantaBankRates,
} from "./parsers.js"
import type { Exchange, FetchRatesOptions, Rate, RateFetch, RateFetchResponse } from "./types.js"

type Context = Readonly<{
  fetchedAt: Date
  options: FetchRatesOptions
}>

type Provider = (context: Context) => Promise<Rate[]>

const timeoutMs = 30_000
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const providers: Record<Exchange, Provider> = {
  BANK_OF_TAIWAN: async (context) => {
    const response = await request(
      "https://rate.bot.com.tw/xrt/fltxt/0/day",
      { headers: { "Accept-Language": "zh-TW,zh;q=0.9" } },
      context.options,
      true,
    )
    return parseBankOfTaiwanRates(await response.text(), context.fetchedAt)
  },
  DBS_BANK: async (context) =>
    parseDbsRates(
      await requestJson(
        "https://www.dbs.com.tw/tw-rates-api/v1/api/twrates/latestForexRates",
        {},
        context.options,
      ),
      context.fetchedAt,
    ),
  BANK_SINOPAC: async (context) => {
    const url = `https://m.sinopac.com/ws/share/rate/ws_exchange.ashx?${context.fetchedAt.getTime()}`
    const getBoard = (kind: "CASH" | "REMIT") =>
      requestJson(
        url,
        {
          body: new URLSearchParams({ exchangeType: kind }),
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          method: "POST",
        },
        context.options,
      )
    const [remit, cash] = await Promise.all([getBoard("REMIT"), getBoard("CASH")])
    return parseSinopacRates(remit, cash, context.fetchedAt)
  },
  ESUN_BANK: async (context) =>
    parseEsunRates(
      await requestJson(
        "https://www.esunbank.com/api/client/ExchangeRate/LastRateInfo",
        { method: "POST" },
        context.options,
      ),
      context.fetchedAt,
    ),
  LINE_BANK: async (context) =>
    parseLineBankRates(
      await requestText(
        "https://www.linebank.com.tw/board-rate/exchange-rate",
        { headers: { "User-Agent": userAgent } },
        context.options,
      ),
      context.fetchedAt,
    ),
  HSBC_BANK: async (context) =>
    parseHsbcRates(
      await requestText("https://www.hsbc.com.tw/currency-rates/", {}, context.options),
      context.fetchedAt,
    ),
  NEXT_BANK: async (context) =>
    parseNextBankRates(
      await requestJson(
        "https://api.nextbank.com.tw/ap6/open/forex/v1.0/GetFXRate",
        { body: "{}", headers: { "Content-Type": "application/json" }, method: "POST" },
        context.options,
        true,
      ),
      context.fetchedAt,
    ),
  KGI_BANK: async (context) =>
    parseKgiRates(
      await requestText(
        "https://www.kgibank.com.tw/zh-tw/personal/interest-rate/fx",
        {},
        context.options,
      ),
      context.fetchedAt,
    ),
  CATHAY_BANK: async (context) =>
    parseCathayRates(
      await requestText(
        "https://www.cathaybk.com.tw/cathaybk/personal/product/deposit/currency-billboard/",
        {},
        context.options,
        true,
      ),
      context.fetchedAt,
    ),
  MEGA_BANK: async (context) => {
    const url = new URL("https://www.megabank.com.tw/api/client/ExchangeRate/GetRateData")
    url.search = new URLSearchParams({
      dic_lang: "zh-TW",
      sc_lang: "zh-TW",
      sc_site: "bank-zh-tw",
    }).toString()
    return parseMegaBankRates(await requestJson(url, {}, context.options), context.fetchedAt)
  },
  FIRST_BANK: async (context) =>
    parseFirstBankRates(
      await requestText(
        "https://www.firstbank.com.tw/sites/fcb/touch/1565688252532",
        {},
        context.options,
      ),
      context.fetchedAt,
    ),
  LAND_BANK: async (context) =>
    parseLandBankRates(
      await requestText(
        "https://rate.landbank.com.tw/zh-TW/Foreign?mid=35",
        { headers: { "User-Agent": userAgent } },
        context.options,
        true,
      ),
      context.fetchedAt,
    ),
  YUANTA_BANK: async (context) =>
    parseYuantaBankRates(
      await requestText(
        "https://www.yuantabank.com.tw/bank/exchangeRate/hostccy.do",
        { headers: { "Accept-Language": "zh-TW,zh;q=0.9", "User-Agent": userAgent } },
        context.options,
      ),
      context.fetchedAt,
    ),
  TAISHIN_BANK: async (context) =>
    parseTaishinRates(
      await requestText(
        "https://www.taishinbank.com.tw/eServiceA/transactionrate/transactionrateExport.jsp?no=5",
        {},
        context.options,
        true,
      ),
      context.fetchedAt,
    ),
  TAICHUNG_BANK: async (context) => {
    const currencies = "USD,EUR,JPY,CHF,SGD,CAD,GBP,NZD,CNY,HKD,ZAR,AUD,SEK"
    const url = new URL("https://openbank.tcbbank.com.tw/openAPI/v1.0.0/otherService/exchangeRates")
    url.searchParams.set("currency", currencies)
    return parseTaichungBankRates(await requestJson(url, {}, context.options), context.fetchedAt)
  },
  COOPERATIVE_BANK: fetchCooperativeBankRates,
  FUBON_BANK: async (context) =>
    parseFubonRates(
      await requestJson(
        "https://www.fubon.com/Fubon_Portal/banking/Personal/deposit/exchange_rate/exchange_rate1_newVersion.jsp",
        { headers: { "User-Agent": userAgent } },
        context.options,
        true,
      ),
      context.fetchedAt,
    ),
}

export async function fetchRates(
  exchange: Exchange = "BANK_OF_TAIWAN",
  options: FetchRatesOptions = {},
): Promise<Rate[]> {
  const provider = providers[exchange]
  if (!provider) throw new Error(`Unsupported exchange: ${exchange}`)
  return provider({ fetchedAt: (options.now ?? (() => new Date()))(), options })
}

async function fetchCooperativeBankRates(context: Context): Promise<Rate[]> {
  const pageResponse = await request(
    "https://www.tcb-bank.com.tw/personal-banking/deposit-exchange/exchange-rate/spot",
    {},
    context.options,
  )
  const token = extractCooperativeBankToken(await pageResponse.text())
  const cookie = (pageResponse.headers?.getSetCookie() ?? [])
    .map((value) => value.split(";", 1)[0])
    .join("; ")
  const payload = await requestJson(
    "https://www.tcb-bank.com.tw/api/client/ForeignExchange/GetSpotForeignExchange",
    {
      body: new URLSearchParams({ __RequestVerificationToken: token }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        ...(cookie ? { Cookie: cookie } : {}),
        "X-Requested-With": "XMLHttpRequest",
      },
      method: "POST",
    },
    context.options,
  )
  return parseCooperativeBankRates(payload, context.fetchedAt)
}

async function requestJson(
  url: string | URL,
  init: RequestInit,
  options: FetchRatesOptions,
  browser = false,
  client?: Impit,
): Promise<unknown> {
  return (await request(url, init, options, browser, client)).json()
}

async function requestText(
  url: string | URL,
  init: RequestInit,
  options: FetchRatesOptions,
  browser = false,
  client?: Impit,
): Promise<string> {
  return (await request(url, init, options, browser, client)).text()
}

async function request(
  url: string | URL,
  init: RequestInit,
  options: FetchRatesOptions,
  browser = false,
  client?: Impit,
): Promise<RateFetchResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? timeoutMs)
  let fetcher: RateFetch = options.fetch ?? globalThis.fetch
  if (!options.fetch && browser) {
    const browserClient = client ?? createBrowser(options)
    fetcher = (input, requestInit) => browserClient.fetch(input, requestInit as never)
  }
  try {
    const response = await fetcher(url, { ...init, redirect: "follow", signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Exchange-rate request failed for ${url} (${response.status})`)
    }
    return response
  } finally {
    clearTimeout(timer)
  }
}

function createBrowser(options: FetchRatesOptions): Impit {
  return new Impit({ browser: "chrome", timeout: options.timeoutMs ?? timeoutMs })
}
