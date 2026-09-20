import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  appendHistory,
  createHistoryRecord,
  HistoryQueryError,
  readHistory,
} from "../src/history.js"
import type { Rate } from "../src/index.js"

const rate = (source: string, exchange: Rate["exchange"] = "BANK_OF_TAIWAN"): Rate => ({
  exchange,
  fetchedAt: "2026-09-20T12:00:00.000Z",
  source,
  spotBuy: 31,
  spotSell: 32,
  target: "TWD",
})

describe("JSONL history", () => {
  test("appends Unicode-safe records and reads ordered filters with a limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "twrate-history-"))
    const path = join(directory, "nested", "rates.jsonl")
    await appendHistory(
      path,
      createHistoryRecord([rate("USD")], { now: () => new Date("2026-09-20T12:00:00Z") }),
    )
    await appendHistory(
      path,
      createHistoryRecord([rate("JPY", "ESUN_BANK")], {
        now: () => new Date("2026-09-21T12:00:00Z"),
      }),
    )

    const all = await readHistory(path)
    assert.deepEqual(
      all.map((record) => record.rates[0]?.source),
      ["USD", "JPY"],
    )
    assert.equal((await readHistory(path, { currencies: ["jpy"] }))[0]?.rates[0]?.source, "JPY")
    assert.equal((await readHistory(path, { exchanges: ["ESUN_BANK"] })).length, 1)
    assert.equal((await readHistory(path, { limit: 1 }))[0]?.recordedAt, "2026-09-21T12:00:00.000Z")
    assert.equal((await readHistory(path, { since: "2026-09-21T00:00:00Z" })).length, 1)
  })

  test("returns an empty list for a missing file", async () => {
    assert.deepEqual(await readHistory(join(tmpdir(), "missing-twrate-history.jsonl")), [])
  })

  test("reports malformed records with line numbers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "twrate-history-invalid-"))
    const path = join(directory, "rates.jsonl")
    await writeFile(path, `${JSON.stringify(createHistoryRecord([rate("USD")]))}\nnot-json\n`)
    await expect(readHistory(path)).rejects.toThrow("line 2")
  })

  test("rejects non-finite quotes before changing history and keeps later records readable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "twrate-history-finite-"))
    const path = join(directory, "rates.jsonl")
    try {
      const valid = createHistoryRecord([rate("USD")])
      await appendHistory(path, valid)
      const original = await readFile(path, "utf8")
      for (const field of ["cashBuy", "cashSell", "spotBuy", "spotSell"] as const) {
        for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
          const record = createHistoryRecord([{ ...rate("USD"), [field]: value }])
          await expect(appendHistory(path, record)).rejects.toThrow("invalid rates")
          assert.equal(await readFile(path, "utf8"), original)
        }
      }
      await appendHistory(path, valid)
      assert.deepEqual(await readHistory(path), [valid, valid])

      await writeFile(path, original.replace('"spotBuy":31', '"spotBuy":1e999'))
      await expect(readHistory(path)).rejects.toThrow("invalid rates")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("identifies query validation errors while preserving RangeError compatibility", async () => {
    for (const options of [
      { limit: 0 },
      { limit: 10001 },
      { since: "invalid" },
      { until: new Date(Number.NaN) },
      { since: "2026-09-22", until: "2026-09-21" },
    ]) {
      await assert.rejects(readHistory("missing", options), (error) => {
        assert.ok(error instanceof HistoryQueryError)
        assert.ok(error instanceof RangeError)
        return true
      })
    }
  })

  test("validates ranges and limits", async () => {
    await expect(readHistory("missing", { limit: 0 })).rejects.toThrow("limit")
    await expect(
      readHistory("missing", { since: "2026-09-22", until: "2026-09-21" }),
    ).rejects.toThrow("after")
  })
})
