import { fetchRates } from "./providers.js"
import type {
  Exchange,
  FetchAllRatesOptions,
  FetchAllRatesResult,
  Rate,
  RateFailure,
} from "./types.js"
import { exchanges } from "./types.js"

export type { AlertOptions, AlertResult } from "./alerts.js"
export { evaluateAlert } from "./alerts.js"
export type { RateClient, RateClientFetchAllOptions, RateClientOptions } from "./client.js"
export { createRateClient } from "./client.js"
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
export type {
  CustomerAction,
  QueryRatesOptions,
  RateField,
  RateSort,
} from "./query.js"
export {
  bestRate,
  executablePrice,
  filterRates,
  groupRates,
  queryRates,
  rateField,
  sortRates,
} from "./query.js"
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
  BankMetadata,
  Exchange,
  FetchAllRatesOptions,
  FetchAllRatesResult,
  FetchRatesOptions,
  Rate,
  RateFailure,
  RateFetch,
  RateFetchResponse,
  RateType,
  SourceKind,
} from "./types.js"
export { banks, exchanges } from "./types.js"

export async function fetchAllRatesDetailed(
  options: FetchAllRatesOptions = {},
): Promise<FetchAllRatesResult> {
  const selected = options.exchanges ?? exchanges
  const fetchedAt = (options.now ?? (() => new Date()))()
  const results = await Promise.allSettled(
    selected.map((exchange) => fetchRates(exchange, { ...options, now: () => fetchedAt })),
  )
  const rates: Rate[] = []
  const failures: RateFailure[] = []
  for (const [index, result] of results.entries()) {
    const exchange = selected[index] as Exchange
    if (result.status === "fulfilled") {
      rates.push(...result.value)
    } else {
      failures.push({ exchange, error: result.reason })
      options.onError?.(exchange, result.reason)
    }
  }
  return { failures, rates }
}

export async function fetchAllRates(options: FetchAllRatesOptions = {}): Promise<Rate[]> {
  return [...(await fetchAllRatesDetailed(options)).rates]
}
