import assert from "node:assert/strict"
import { describe, expect, test, vi } from "vitest"
import { createRateClient } from "../src/index.js"

const fetchedAt = new Date("2026-09-20T12:00:00.000Z")
const botText = `幣別 匯率 現金 即期 c4 c5 c6 c7 c8 c9 c10 匯率 現金 即期
USD 本行買入 31.4 31.7 - - - - - - - 本行賣出 32.1 31.9`

describe("rate client", () => {
  test("coalesces misses, caches immutable successes, expires, and clears", async () => {
    let now = fetchedAt
    const fetch = vi.fn(async () => new Response(botText))
    const client = createRateClient({ cacheTtlMs: 1000, fetch, now: () => now })

    const [first, concurrent] = await Promise.all([client.fetchRates(), client.fetchRates()])
    assert.equal(fetch.mock.calls.length, 1)
    assert.equal(first, concurrent)
    assert.equal(Object.isFrozen(first), true)
    assert.equal(Object.isFrozen(first[0]), true)
    await client.fetchRates()
    assert.equal(fetch.mock.calls.length, 1)

    now = new Date(fetchedAt.getTime() + 1001)
    await client.fetchRates()
    assert.equal(fetch.mock.calls.length, 2)
    client.clearCache()
    await client.fetchRates()
    assert.equal(fetch.mock.calls.length, 3)
  })

  test("invalidates in-flight requests without allowing stale cache refills", async () => {
    const responses: Array<(response: Response) => void> = []
    const fetch = vi.fn(() => new Promise<Response>((resolve) => responses.push(resolve)))
    const client = createRateClient({ cacheTtlMs: 1000, fetch, now: () => fetchedAt })

    const stale = client.fetchRates()
    client.clearCache()
    const fresh = client.fetchRates()
    assert.equal(fetch.mock.calls.length, 2)

    responses[0]?.(new Response(botText))
    await stale
    const coalesced = client.fetchRates()
    assert.equal(coalesced, fresh)

    responses[1]?.(new Response(botText))
    await Promise.all([fresh, coalesced])
    await client.fetchRates()
    assert.equal(fetch.mock.calls.length, 2)
  })

  test("does not cache failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(botText))
    const client = createRateClient({ cacheTtlMs: 1000, fetch, now: () => fetchedAt })
    await expect(client.fetchRates()).rejects.toThrow("503")
    await client.fetchRates()
    assert.equal(fetch.mock.calls.length, 2)
  })

  test("reports partial failures from scheduled fetches", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("dbs.com.tw")
        ? new Response("", { status: 503 })
        : new Response(botText),
    )
    const client = createRateClient({ fetch, maxConcurrency: 1, now: () => fetchedAt })
    const result = await client.fetchAllRatesDetailed({
      exchanges: ["BANK_OF_TAIWAN", "DBS_BANK"],
    })
    assert.equal(result.rates.length, 1)
    assert.deepEqual(
      result.failures.map((item) => item.exchange),
      ["DBS_BANK"],
    )
  })

  test("validates scheduling and cache controls", () => {
    expect(() => createRateClient({ cacheTtlMs: -1 })).toThrow("cacheTtlMs")
    expect(() => createRateClient({ maxConcurrency: 0 })).toThrow("maxConcurrency")
    expect(() => createRateClient({ minStartIntervalMs: -1 })).toThrow("minStartIntervalMs")
  })

  test("enforces a minimum interval between provider starts", async () => {
    vi.useFakeTimers({ now: 0 })
    try {
      const starts: number[] = []
      const fetch = vi.fn(async (input: string | URL | Request) => {
        starts.push(Date.now())
        if (String(input).includes("dbs.com.tw")) {
          return new Response(
            JSON.stringify({
              results: {
                assets: [{ recData: [{ currency: "USD", ttBuy: "31", ttSell: "32" }] }],
              },
            }),
          )
        }
        return new Response(botText)
      })
      const client = createRateClient({
        fetch,
        maxConcurrency: 2,
        minStartIntervalMs: 100,
        now: () => fetchedAt,
      })
      const request = client.fetchAllRates({ exchanges: ["BANK_OF_TAIWAN", "DBS_BANK"] })
      await vi.advanceTimersByTimeAsync(99)
      assert.deepEqual(starts, [0])
      await vi.advanceTimersByTimeAsync(1)
      await request
      assert.deepEqual(starts, [0, 100])
    } finally {
      vi.useRealTimers()
    }
  })

  test("limits concurrent provider starts", async () => {
    let active = 0
    let peak = 0
    const fetch = vi.fn(async (input: string | URL | Request) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      if (String(input).includes("dbs.com.tw")) {
        return new Response(
          JSON.stringify({
            results: { assets: [{ recData: [{ currency: "USD", ttBuy: "31", ttSell: "32" }] }] },
          }),
        )
      }
      return new Response(botText)
    })
    const client = createRateClient({ fetch, maxConcurrency: 1, now: () => fetchedAt })
    await client.fetchAllRates({ exchanges: ["BANK_OF_TAIWAN", "DBS_BANK"] })
    assert.equal(peak, 1)
  })
})
