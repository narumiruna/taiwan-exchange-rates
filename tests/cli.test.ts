import assert from "node:assert/strict"
import { describe, test } from "vitest"
import { resolveExchange, runCli } from "../src/cli.js"
import type { Rate } from "../src/index.js"

const usdRate: Rate = {
  exchange: "BANK_OF_TAIWAN",
  fetchedAt: "2026-09-20T12:00:00.000Z",
  source: "USD",
  spotBuy: 31,
  spotSell: 32,
  target: "TWD",
}

function captureOutput() {
  const errors: string[] = []
  const logs: string[] = []
  return {
    errors,
    logs,
    output: {
      error: (message?: unknown) => errors.push(String(message)),
      log: (message?: unknown) => logs.push(String(message)),
    },
  }
}

const api = {
  fetchAllRates: async () => [usdRate],
  fetchRates: async () => [usdRate],
}

describe("CLI", () => {
  test("prints help and lists all supported banks without a network request", async () => {
    const help = captureOutput()
    assert.equal(await runCli(["--help"], help.output, api), 0)
    assert.match(help.logs[0] ?? "", /Usage: twrate/)

    const list = captureOutput()
    assert.equal(await runCli(["--list-banks"], list.output, api), 0)
    assert.equal((list.logs[0] ?? "").split("\n").length, 17)
  })

  test("validates currencies and bank names", async () => {
    const invalidCurrency = captureOutput()
    assert.equal(await runCli(["US"], invalidCurrency.output, api), 2)
    assert.match(invalidCurrency.errors[0] ?? "", /three-letter/)

    const invalidBank = captureOutput()
    assert.equal(await runCli(["USD", "--bank", "unknown"], invalidBank.output, api), 2)
    assert.match(invalidBank.errors[0] ?? "", /Unknown bank/)
  })

  test("renders table and JSON output", async () => {
    const table = captureOutput()
    assert.equal(await runCli(["USD"], table.output, api), 0)
    assert.match(table.logs[0] ?? "", /USD\/TWD 各行即時牌價/)
    assert.match(table.logs[0] ?? "", /台灣銀行/)

    const json = captureOutput()
    assert.equal(await runCli(["USD", "--json", "--bank", "bot"], json.output, api), 0)
    assert.deepEqual(JSON.parse(json.logs[0] ?? "[]"), [usdRate])
  })

  test("resolves aliases and exchange identifiers", () => {
    assert.equal(resolveExchange("bot"), "BANK_OF_TAIWAN")
    assert.equal(resolveExchange("ESUN_BANK"), "ESUN_BANK")
    assert.equal(resolveExchange("unknown"), undefined)
  })
})
