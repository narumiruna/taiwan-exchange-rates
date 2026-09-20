import { fetchRates } from "./providers.js"
import type { Exchange, FetchAllRatesOptions, Rate } from "./types.js"
import { exchanges } from "./types.js"

export {
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
export { fetchRates } from "./providers.js"
export {
  cashMid,
  cashSpread,
  createRate,
  hasAnyRate,
  normalizeCurrencyCode,
  parseRateNumber,
  spotMid,
  spotSpread,
  symbol,
} from "./rates.js"
export type {
  Bank,
  Exchange,
  FetchAllRatesOptions,
  FetchRatesOptions,
  Rate,
  RateFetch,
  RateFetchResponse,
} from "./types.js"
export { banks, exchanges } from "./types.js"

export async function fetchAllRates(options: FetchAllRatesOptions = {}): Promise<Rate[]> {
  const selected = options.exchanges ?? exchanges
  const fetchedAt = (options.now ?? (() => new Date()))()
  const results = await Promise.allSettled(
    selected.map((exchange) => fetchRates(exchange, { ...options, now: () => fetchedAt })),
  )
  const rates: Rate[] = []
  for (const [index, result] of results.entries()) {
    const exchange = selected[index] as Exchange
    if (result.status === "fulfilled") {
      rates.push(...result.value)
    } else {
      options.onError?.(exchange, result.reason)
    }
  }
  return rates
}
