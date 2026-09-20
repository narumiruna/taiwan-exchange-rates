import assert from "node:assert/strict"
import { describe, expect, test } from "vitest"
import { evaluateAlert, type Rate } from "../src/index.js"

const rates: Rate[] = [
  {
    cashBuy: 30,
    cashSell: 33,
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

describe("rate alerts", () => {
  test("uses inclusive best customer buy and sell thresholds", () => {
    const buy = evaluateAlert(rates, { action: "buy", atOrBelow: 31.8 })
    assert.equal(buy.triggered, true)
    assert.equal(buy.rate?.exchange, "ESUN_BANK")
    const sell = evaluateAlert(rates, { action: "sell", atOrAbove: 31.5 })
    assert.equal(sell.triggered, true)
    assert.equal(sell.rate?.exchange, "ESUN_BANK")
  })

  test("reports unmet and missing executable prices", () => {
    assert.equal(evaluateAlert(rates, { action: "buy", atOrBelow: 31 }).triggered, false)
    assert.equal(
      evaluateAlert(rates.slice(1), { action: "buy", atOrBelow: 40, rateType: "cash" }).triggered,
      false,
    )
  })

  test("validates threshold direction", () => {
    expect(() => evaluateAlert(rates, { action: "buy", atOrAbove: 32 })).toThrow("atOrBelow")
    expect(() => evaluateAlert(rates, { action: "sell", atOrAbove: 0 })).toThrow("positive")
  })
})
