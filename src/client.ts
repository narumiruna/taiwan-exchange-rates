import { fetchRates as fetchProviderRates } from "./providers.js"
import type {
  Exchange,
  FetchAllRatesResult,
  FetchRatesOptions,
  Rate,
  RateFailure,
} from "./types.js"
import { exchanges } from "./types.js"

export type RateClientOptions = FetchRatesOptions &
  Readonly<{
    cacheTtlMs?: number
    maxConcurrency?: number
    minStartIntervalMs?: number
  }>

export type RateClientFetchAllOptions = Readonly<{
  exchanges?: readonly Exchange[]
  onError?: (exchange: Exchange, error: unknown) => void
}>

export type RateClient = Readonly<{
  clearCache: () => void
  fetchAllRates: (options?: RateClientFetchAllOptions) => Promise<readonly Rate[]>
  fetchAllRatesDetailed: (options?: RateClientFetchAllOptions) => Promise<FetchAllRatesResult>
  fetchRates: (exchange?: Exchange) => Promise<readonly Rate[]>
}>

type CacheEntry = Readonly<{ expiresAt: number; rates: readonly Rate[] }>
type PendingEntry = Readonly<{
  generation: number
  request: Promise<readonly Rate[]>
}>

export function createRateClient(options: RateClientOptions = {}): RateClient {
  const cacheTtlMs = nonNegative(options.cacheTtlMs ?? 0, "cacheTtlMs")
  const maxConcurrency = positiveInteger(
    options.maxConcurrency ?? Number.MAX_SAFE_INTEGER,
    "maxConcurrency",
  )
  const minStartIntervalMs = nonNegative(options.minStartIntervalMs ?? 0, "minStartIntervalMs")
  const now = options.now ?? (() => new Date())
  const cache = new Map<Exchange, CacheEntry>()
  const pending = new Map<Exchange, PendingEntry>()
  const scheduler = createScheduler(maxConcurrency, minStartIntervalMs)
  let cacheGeneration = 0

  const load = (exchange: Exchange, fetchedAt: Date): Promise<readonly Rate[]> => {
    const cached = cache.get(exchange)
    if (cached && cached.expiresAt > now().getTime()) return Promise.resolve(cached.rates)
    if (cached) cache.delete(exchange)
    const generation = cacheGeneration
    const running = pending.get(exchange)
    if (running?.generation === generation) return running.request

    const request = scheduler
      .schedule(() =>
        fetchProviderRates(exchange, {
          fetch: options.fetch,
          now: () => fetchedAt,
          timeoutMs: options.timeoutMs,
        }),
      )
      .then((rates) => {
        const immutable = immutableRates(rates)
        if (cacheTtlMs > 0 && generation === cacheGeneration) {
          cache.set(exchange, { expiresAt: now().getTime() + cacheTtlMs, rates: immutable })
        }
        return immutable
      })
    const entry = { generation, request }
    const clearPending = () => {
      if (pending.get(exchange) === entry) pending.delete(exchange)
    }
    pending.set(exchange, entry)
    void request.then(clearPending, clearPending)
    return request
  }

  const fetchRates = (exchange: Exchange = "BANK_OF_TAIWAN") => load(exchange, now())

  const fetchAllRatesDetailed = async (
    fetchOptions: RateClientFetchAllOptions = {},
  ): Promise<FetchAllRatesResult> => {
    const selected = fetchOptions.exchanges ?? exchanges
    const fetchedAt = now()
    const results = await Promise.allSettled(selected.map((exchange) => load(exchange, fetchedAt)))
    const rates: Rate[] = []
    const failures: RateFailure[] = []
    for (const [index, result] of results.entries()) {
      const exchange = selected[index] as Exchange
      if (result.status === "fulfilled") {
        rates.push(...result.value)
      } else {
        failures.push({ error: result.reason, exchange })
        fetchOptions.onError?.(exchange, result.reason)
      }
    }
    return Object.freeze({
      failures: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))),
      rates: immutableRates(rates),
    })
  }

  return {
    clearCache: () => {
      cacheGeneration += 1
      cache.clear()
      pending.clear()
    },
    fetchAllRates: async (fetchOptions = {}) => (await fetchAllRatesDetailed(fetchOptions)).rates,
    fetchAllRatesDetailed,
    fetchRates,
  }
}

function immutableRates(rates: readonly Rate[]): readonly Rate[] {
  return Object.freeze(rates.map((rate) => Object.freeze({ ...rate })))
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be non-negative`)
  return value
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be positive`)
  return value
}

function createScheduler(maxConcurrency: number, minStartIntervalMs: number) {
  const queue: Array<{
    reject: (error: unknown) => void
    resolve: (value: Rate[]) => void
    task: () => Promise<Rate[]>
  }> = []
  let active = 0
  let nextStartAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const drain = () => {
    if (timer || active >= maxConcurrency || queue.length === 0) return
    const delay = Math.max(0, nextStartAt - Date.now())
    if (delay > 0) {
      timer = setTimeout(() => {
        timer = undefined
        drain()
      }, delay)
      return
    }

    const item = queue.shift()
    if (!item) return
    active += 1
    nextStartAt = Date.now() + minStartIntervalMs
    item
      .task()
      .then(item.resolve, item.reject)
      .finally(() => {
        active -= 1
        drain()
      })
    drain()
  }

  return {
    schedule(task: () => Promise<Rate[]>): Promise<Rate[]> {
      return new Promise((resolve, reject) => {
        queue.push({ reject, resolve, task })
        drain()
      })
    },
  }
}
