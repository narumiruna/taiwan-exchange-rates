import assert from "node:assert/strict"
import { describe, test } from "vitest"
import type { Rate } from "../src/index.js"
import { formatCsv, formatRates } from "../src/output.js"

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
    cashBuy: 0.2,
    cashSell: 0.22,
    exchange: "ESUN_BANK",
    fetchedAt: "2026-09-20T12:00:00.000Z",
    source: "JPY",
    target: "TWD",
  },
]

describe("rate output", () => {
  test("renders multiple currency tables and customer intent", () => {
    const output = formatRates(rates, "table", { action: "buy", rateType: "spot" })
    assert.match(output, /USD\/TWD/)
    assert.match(output, /JPY\/TWD/)
    assert.match(output, /顧客買入即期/)
    assert.match(output, /-\t-/)
  })

  test("renders flat JSON", () => {
    assert.deepEqual(JSON.parse(formatRates(rates, "json")), rates)
  })

  test("renders deterministic RFC 4180 CSV with missing values", () => {
    const output = formatCsv(rates)
    assert.match(output, /^source,target,exchange,bank,/)
    assert.match(output, /USD,TWD,BANK_OF_TAIWAN,台灣銀行,31,32/)
    assert.match(output, /JPY,TWD,ESUN_BANK,玉山銀行,,,,0.2,0.22/)
    const quoted = formatCsv([{ ...rates[0], fetchedAt: 'value,with"quote' } as Rate])
    assert.match(quoted, /"value,with""quote"/)
  })
})
