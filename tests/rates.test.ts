import assert from "node:assert/strict"
import { describe, expect, test } from "vitest"
import {
  cashMid,
  cashSpread,
  createRate,
  normalizeCurrencyCode,
  parseRateNumber,
  spotMid,
  spotSpread,
  symbol,
} from "../src/index.js"

const rate = createRate(
  "BANK_OF_TAIWAN",
  "usd",
  { cashBuy: 31, cashSell: 33, spotBuy: 31.5, spotSell: 32.5 },
  "2026-09-20T12:00:00.000Z",
)

describe("normalized rates", () => {
  test("normalizes currency codes and missing bank values", () => {
    assert.equal(normalizeCurrencyCode(" usd "), "USD")
    assert.equal(normalizeCurrencyCode("US Dollar"), undefined)
    assert.equal(parseRateNumber(" 1,234.50 "), 1234.5)
    for (const value of [undefined, null, true, "", "-", "N/A", "0", -1, Number.NaN]) {
      assert.equal(parseRateNumber(value), undefined)
    }
  })

  test("calculates midpoint, spread, and symbol", () => {
    assert.equal(symbol(rate), "USD/TWD")
    assert.equal(spotMid(rate), 32)
    assert.equal(cashMid(rate), 32)
    expect(spotSpread(rate)).toBeCloseTo(1 / 32)
    expect(cashSpread(rate)).toBeCloseTo(2 / 32)
  })

  test("returns undefined for incomplete derived rates", () => {
    const incomplete = createRate("LINE_BANK", "JPY", { spotBuy: 0.2 }, new Date(0))
    assert.equal(spotMid(incomplete), undefined)
    assert.equal(spotSpread(incomplete), undefined)
    assert.equal(cashMid(incomplete), undefined)
  })
})
