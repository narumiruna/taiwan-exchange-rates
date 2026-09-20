import assert from "node:assert/strict"
import { describe, test } from "vitest"
import {
  bestRate,
  executablePrice,
  queryRates,
  type Rate,
  rateField,
  sortRates,
} from "../src/index.js"

const rate = (exchange: Rate["exchange"], values: Partial<Rate>, source = "USD"): Rate => ({
  exchange,
  fetchedAt: "2026-09-20T12:00:00.000Z",
  source,
  target: "TWD",
  ...values,
})

const rates = [
  rate("BANK_OF_TAIWAN", { cashBuy: 30, cashSell: 33, spotBuy: 31, spotSell: 32 }),
  rate("ESUN_BANK", { cashBuy: 30.5, cashSell: 32.5, spotBuy: 31.5, spotSell: 31.8 }),
  rate("LINE_BANK", { spotBuy: 31.2, spotSell: 31.8 }),
]

describe("rate queries", () => {
  test("maps customer intent to the bank field", () => {
    assert.equal(rateField("buy", "spot"), "spotSell")
    assert.equal(rateField("sell", "spot"), "spotBuy")
    assert.equal(rateField("buy", "cash"), "cashSell")
    assert.equal(rateField("sell", "cash"), "cashBuy")
    assert.equal(executablePrice(rates[0] as Rate, "buy"), 32)
  })

  test("ranks buy low-to-high and sell high-to-low with deterministic ties", () => {
    assert.deepEqual(
      sortRates(rates, { action: "buy", sort: "price" }).map((item) => item.exchange),
      ["ESUN_BANK", "LINE_BANK", "BANK_OF_TAIWAN"],
    )
    assert.deepEqual(
      sortRates(rates, { action: "sell", sort: "price" }).map((item) => item.exchange),
      ["ESUN_BANK", "LINE_BANK", "BANK_OF_TAIWAN"],
    )
  })

  test("sorts missing fields last and excludes them from executable rankings", () => {
    const cash = sortRates(rates, { action: "buy", rateType: "cash", sort: "price" })
    assert.equal(cash.at(-1)?.exchange, "LINE_BANK")
    assert.equal(bestRate(rates, "buy", "cash")?.exchange, "ESUN_BANK")
    assert.deepEqual(
      queryRates(rates, {
        action: "buy",
        rateType: "cash",
        sort: "price",
        top: 3,
      }).map((item) => item.exchange),
      ["ESUN_BANK", "BANK_OF_TAIWAN"],
    )
  })

  test("excludes missing spreads from top-N without changing unlimited spread output", () => {
    const mixed = [...rates, rate("DBS_BANK", { cashBuy: 31 })]
    for (const sort of [undefined, "spread"] as const) {
      assert.deepEqual(
        queryRates(mixed, { rateType: "cash", sort, top: 4 }).map((item) => item.exchange),
        ["ESUN_BANK", "BANK_OF_TAIWAN"],
      )
      assert.deepEqual(queryRates(mixed.slice(2), { rateType: "cash", sort, top: 4 }), [])
    }
    assert.equal(queryRates(mixed, { rateType: "cash" }).length, 4)
    assert.equal(sortRates(mixed, { rateType: "cash" }).length, 4)
  })

  test.each([
    {},
    { top: 1 },
    { action: "buy", sort: "price", top: 1 },
    { action: "sell", rateType: "cash", sort: "price" },
  ] as const)("treats an empty currency filter as unfiltered with %j", (options) => {
    const mixed = [rate("DBS_BANK", { spotBuy: 0.2, spotSell: 0.21 }, "JPY"), ...rates]
    const original = [...mixed]
    const expected = queryRates(mixed, options)
    assert.ok(expected.length > 0)
    assert.deepEqual(queryRates(mixed, { ...options, currencies: [] }), expected)
    assert.deepEqual(mixed, original)
    assert.deepEqual(queryRates([], { ...options, currencies: [] }), [])
    assert.deepEqual(
      queryRates(mixed, { currencies: [], top: 1 }).map((item) => item.source),
      ["JPY", "USD"],
    )
  })

  test.each([0, 1, 3])("rejects price sorting without action for %i input rates", (count) => {
    for (const sort of [sortRates, queryRates]) {
      assert.throws(() => sort(rates.slice(0, count), { sort: "price" }), {
        name: "RangeError",
        message: "Price sorting requires a customer action",
      })
    }
  })

  test("validates price sorting and top-N", () => {
    assert.throws(() => queryRates(rates, { sort: "price" }), /customer action/)
    assert.throws(() => queryRates(rates, { top: 0 }), /positive integer/)
  })

  test("filters, groups, and applies top per currency", () => {
    const mixed = [...rates, rate("DBS_BANK", { spotBuy: 0.2, spotSell: 0.21 }, "JPY")]
    const selected = queryRates(mixed, {
      action: "buy",
      currencies: ["usd", "JPY"],
      sort: "price",
      top: 1,
    })
    assert.deepEqual(
      selected.map((item) => [item.source, item.exchange]),
      [
        ["USD", "ESUN_BANK"],
        ["JPY", "DBS_BANK"],
      ],
    )
  })
})
