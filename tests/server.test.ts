import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "vitest"
import { appendHistory, createHistoryRecord } from "../src/history.js"
import type { Rate, RateClient } from "../src/index.js"
import { startServer } from "../src/server.js"

const rates: Rate[] = [
  {
    exchange: "BANK_OF_TAIWAN",
    fetchedAt: "2026-09-20T12:00:00.000Z",
    source: "USD",
    spotBuy: 31,
    spotSell: 32,
    target: "TWD",
  },
  {
    exchange: "ESUN_BANK",
    fetchedAt: "2026-09-20T12:00:00.000Z",
    source: "USD",
    spotBuy: 31.5,
    spotSell: 31.8,
    target: "TWD",
  },
]

const client: RateClient = {
  clearCache: () => {},
  fetchAllRates: async () => rates,
  fetchAllRatesDetailed: async () => ({
    failures: [{ error: new Error("offline"), exchange: "DBS_BANK" }],
    rates,
  }),
  fetchRates: async () => rates,
}

describe("HTTP server", () => {
  test("serves health, bank metadata, ranked rates, and the accessible page", async () => {
    const server = await startServer({ client, port: 0 })
    try {
      const health = await fetch(`${server.url}/health`)
      assert.equal(health.status, 200)
      assert.deepEqual(await health.json(), { status: "ok" })
      assert.equal(health.headers.get("access-control-allow-origin"), null)
      assert.match(health.headers.get("content-security-policy") ?? "", /default-src/)

      const banks = await (await fetch(`${server.url}/api/banks`)).json()
      assert.equal(banks.banks.length, 17)

      const response = await fetch(
        `${server.url}/api/rates?currency=USD&action=buy&type=spot&top=1`,
      )
      const body = await response.json()
      assert.equal(body.rates[0].exchange, "ESUN_BANK")
      assert.deepEqual(body.failures, [{ error: "offline", exchange: "DBS_BANK" }])

      const page = await (await fetch(server.url)).text()
      assert.match(page, /<main>/)
      assert.match(page, /aria-live="polite"/)
      assert.match(page, /id="query-form"/)
      assert.doesNotMatch(page, /offline/)
    } finally {
      await Promise.all([server.close(), server.close()])
      await server.closed
    }
  })

  test("omits unavailable prices and spreads from HTTP rankings", async () => {
    const quoted = { ...rates[0], cashBuy: 30, cashSell: 33 } as Rate
    const rankingClient: RateClient = {
      ...client,
      fetchAllRatesDetailed: async () => ({
        failures: [{ error: new Error("offline"), exchange: "DBS_BANK" }],
        rates: [quoted, rates[1] as Rate],
      }),
    }
    const server = await startServer({ client: rankingClient, port: 0 })
    try {
      for (const action of ["", "&action=buy", "&action=sell"]) {
        const response = await fetch(
          `${server.url}/api/rates?currency=USD&type=cash&top=3${action}`,
        )
        assert.equal(response.status, 200)
        const body = await response.json()
        assert.deepEqual(body.rates, [quoted])
        assert.deepEqual(body.failures, [{ error: "offline", exchange: "DBS_BANK" }])
      }
      const empty = await fetch(`${server.url}/api/rates?currency=JPY&type=cash&action=buy`)
      assert.equal(empty.status, 200)
      assert.deepEqual((await empty.json()).rates, [])
    } finally {
      await server.close()
    }
  })

  test("validates methods, query bounds, missing routes, and optional history", async () => {
    const server = await startServer({ client, port: 0 })
    try {
      assert.equal((await fetch(`${server.url}/health`, { method: "POST" })).status, 405)
      assert.equal((await fetch(`${server.url}/api/rates`)).status, 400)
      assert.equal((await fetch(`${server.url}/api/rates?currency=US`)).status, 400)
      assert.equal((await fetch(`${server.url}/api/rates?currency=USD&top=101`)).status, 400)
      assert.equal((await fetch(`${server.url}/api/rates?currency=USD&action=trade`)).status, 400)
      assert.equal((await fetch(`${server.url}/api/history`)).status, 404)
      assert.equal((await fetch(`${server.url}/missing`)).status, 404)
    } finally {
      await server.close()
    }
  })

  test("serves bounded configured history without accepting arbitrary paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "twrate-server-"))
    const historyFile = join(directory, "rates.jsonl")
    await appendHistory(historyFile, createHistoryRecord(rates))
    const server = await startServer({ client, historyFile, port: 0 })
    try {
      const response = await fetch(`${server.url}/api/history?currency=USD&limit=1`)
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.records.length, 1)
      assert.equal((await fetch(`${server.url}/api/history?limit=1001`)).status, 400)
      assert.equal((await fetch(`${server.url}/api/history?exchange=UNKNOWN`)).status, 400)
    } finally {
      await server.close()
    }
  })
})
