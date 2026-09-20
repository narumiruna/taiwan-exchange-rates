import assert from "node:assert/strict"
import { describe, expect, test, vi } from "vitest"
import { fetchAllRates, fetchRates } from "../src/index.js"

const fetchedAt = new Date("2026-09-20T12:00:00.000Z")
const botText = `幣別 匯率 現金 即期 c4 c5 c6 c7 c8 c9 c10 匯率 現金 即期
USD 本行買入 31.4 31.7 - - - - - - - 本行賣出 32.1 31.9`

describe("provider requests", () => {
  test("uses Bank of Taiwan as the default source", async () => {
    const mockFetch = vi.fn(async () => new Response(botText))
    const rates = await fetchRates(undefined, { fetch: mockFetch, now: () => fetchedAt })

    assert.equal(mockFetch.mock.calls.length, 1)
    assert.match(String(mockFetch.mock.calls[0]?.[0]), /rate\.bot\.com\.tw/)
    assert.equal(rates[0]?.exchange, "BANK_OF_TAIWAN")
  })

  test("requests and merges SinoPac boards", async () => {
    const mockFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const isCash = String(init?.body).includes("CASH")
      return new Response(
        JSON.stringify([
          {
            Header: "SUCCESS",
            SubInfo: [
              {
                DataValue2: isCash ? "31.4" : "31.7",
                DataValue3: isCash ? "32.1" : "31.9",
                DataValue4: "USD",
              },
            ],
          },
        ]),
      )
    })
    const rates = await fetchRates("BANK_SINOPAC", { fetch: mockFetch, now: () => fetchedAt })

    assert.equal(mockFetch.mock.calls.length, 2)
    assert.equal(rates[0]?.spotBuy, 31.7)
    assert.equal(rates[0]?.cashBuy, 31.4)
  })

  test("isolates failures while fetching selected banks concurrently", async () => {
    const failures: string[] = []
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("dbs.com.tw")) return new Response("unavailable", { status: 503 })
      return new Response(botText)
    })
    const rates = await fetchAllRates({
      exchanges: ["BANK_OF_TAIWAN", "DBS_BANK"],
      fetch: mockFetch,
      now: () => fetchedAt,
      onError: (exchange) => failures.push(exchange),
    })

    assert.equal(rates[0]?.exchange, "BANK_OF_TAIWAN")
    assert.deepEqual(failures, ["DBS_BANK"])
  })

  test("rejects unsuccessful HTTP responses", async () => {
    await expect(
      fetchRates("DBS_BANK", { fetch: async () => new Response("", { status: 500 }) }),
    ).rejects.toThrow("500")
  })
})
