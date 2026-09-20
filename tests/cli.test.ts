import assert from "node:assert/strict"
import { access, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test, vi } from "vitest"
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

  test("supports customer-intent ranking, multiple currencies, top-N, and CSV", async () => {
    const compared: Rate[] = [
      usdRate,
      { ...usdRate, exchange: "ESUN_BANK", spotBuy: 31.5, spotSell: 31.8 },
      { ...usdRate, exchange: "DBS_BANK", source: "JPY", spotBuy: 0.2, spotSell: 0.21 },
    ]
    const comparisonApi = {
      fetchAllRates: async () => compared,
      fetchRates: async () => compared,
    }
    const output = captureOutput()
    assert.equal(
      await runCli(
        ["USD", "JPY", "--action", "buy", "--sort", "price", "--top", "1"],
        output.output,
        comparisonApi,
      ),
      0,
    )
    assert.match(output.logs[0] ?? "", /玉山銀行/)
    assert.doesNotMatch(output.logs[0] ?? "", /台灣銀行/)
    assert.match(output.logs[0] ?? "", /JPY\/TWD/)

    const csv = captureOutput()
    assert.equal(await runCli(["USD", "--format", "csv"], csv.output, comparisonApi), 0)
    assert.match(csv.logs[0] ?? "", /^source,target,exchange/)
  })

  test.each(["table", "json", "csv"])(
    "returns no-data status for an empty ranked result in %s output",
    async (format) => {
      for (const sort of ["price", "spread"]) {
        const output = captureOutput()
        assert.equal(
          await runCli(
            [
              "USD",
              "--bank",
              "line",
              "--action",
              "buy",
              "--type",
              "cash",
              "--sort",
              sort,
              "--top",
              "3",
              "--format",
              format,
            ],
            output.output,
            api,
          ),
          1,
        )
        assert.deepEqual(output.logs, [])
        assert.match(output.errors[0] ?? "", /No .*rates/)
      }
    },
  )

  test("propagates timeout and validates option combinations", async () => {
    const fetchAllRates = vi.fn(async () => [usdRate])
    const timeoutApi = { fetchAllRates, fetchRates: async () => [usdRate] }
    assert.equal(await runCli(["USD", "--timeout", "1234"], captureOutput().output, timeoutApi), 0)
    assert.equal(fetchAllRates.mock.calls[0]?.[0]?.timeoutMs, 1234)

    const invalid = captureOutput()
    assert.equal(await runCli(["USD", "--sort", "price"], invalid.output, api), 2)
    assert.match(invalid.errors[0] ?? "", /requires --action/)
    assert.equal(await runCli(["USD", "--top", "0"], invalid.output, api), 2)
    assert.equal(await runCli(["USD", "--cache-ttl", "-1"], invalid.output, api), 2)
  })

  test("returns usage exits for command-local numeric validation", async () => {
    const fetchAllRates = vi.fn(async () => [usdRate])
    const localApi = { fetchAllRates, fetchRates: async () => [usdRate] }

    assert.equal(
      await runCli(
        ["history", "--history-file", "missing.jsonl", "--limit", "0"],
        captureOutput().output,
        localApi,
      ),
      2,
    )
    assert.equal(
      await runCli(
        ["alert", "USD", "--action", "buy", "--at-or-below", "0"],
        captureOutput().output,
        localApi,
      ),
      2,
    )
    assert.equal(await runCli(["serve", "--port", "-1"], captureOutput().output, localApi), 2)
    assert.equal(fetchAllRates.mock.calls.length, 0)
  })

  test("discovers currencies with partial failures and JSON bank metadata", async () => {
    const discoveryApi = {
      fetchAllRates: async (options?: {
        onError?: (exchange: "DBS_BANK", error: Error) => void
      }) => {
        options?.onError?.("DBS_BANK", new Error("offline"))
        return [usdRate, { ...usdRate, source: "JPY" }]
      },
      fetchRates: async () => [usdRate],
    }
    const currencies = captureOutput()
    assert.equal(
      await runCli(["--list-currencies"], currencies.output, discoveryApi as typeof api),
      0,
    )
    assert.match(currencies.logs[0] ?? "", /USD/)
    assert.match(currencies.errors[0] ?? "", /DBS_BANK/)

    const metadata = captureOutput()
    assert.equal(await runCli(["--list-banks", "--format", "json"], metadata.output, api), 0)
    assert.equal(JSON.parse(metadata.logs[0] ?? "[]").length, 17)
  })

  test("writes and reads explicit history without hidden files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "twrate-cli-"))
    const historyFile = join(directory, "rates.jsonl")
    assert.equal(
      await runCli(["USD", "--history-file", historyFile], captureOutput().output, api),
      0,
    )
    await expect(access(historyFile)).resolves.toBeUndefined()

    const history = captureOutput()
    assert.equal(
      await runCli(
        ["history", "USD", "--history-file", historyFile, "--format", "json"],
        history.output,
        api,
      ),
      0,
    )
    assert.equal(JSON.parse(history.logs[0] ?? "[]").length, 1)

    const absent = join(directory, "absent.jsonl")
    assert.equal(await runCli(["USD"], captureOutput().output, api), 0)
    await expect(access(absent)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("evaluates alert thresholds and exit codes", async () => {
    const met = captureOutput()
    assert.equal(
      await runCli(["alert", "USD", "--action", "buy", "--at-or-below", "32"], met.output, api),
      0,
    )
    assert.match(met.logs[0] ?? "", /ALERT/)
    assert.equal(
      await runCli(
        ["alert", "USD", "--action", "sell", "--at-or-above", "40"],
        captureOutput().output,
        api,
      ),
      1,
    )
    const fetchAllRates = vi.fn(async () => [usdRate])
    assert.equal(
      await runCli(["alert", "USD", "--action", "buy"], captureOutput().output, {
        fetchAllRates,
        fetchRates: async () => [usdRate],
      }),
      2,
    )
    assert.equal(fetchAllRates.mock.calls.length, 0)
  })

  test("resolves aliases and exchange identifiers", () => {
    assert.equal(resolveExchange("bot"), "BANK_OF_TAIWAN")
    assert.equal(resolveExchange("ESUN_BANK"), "ESUN_BANK")
    assert.equal(resolveExchange("unknown"), undefined)
  })
})
