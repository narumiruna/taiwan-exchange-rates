import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "vitest"
import { banks, exchanges } from "../src/index.js"

describe("bank metadata", () => {
  test("covers every exchange with complete public metadata", () => {
    assert.deepEqual(
      banks.map((bank) => bank.exchange),
      exchanges,
    )
    for (const bank of banks) {
      assert.ok(bank.name)
      assert.ok(bank.nameZhTw)
      assert.equal(new URL(bank.rateUrl).protocol, "https:")
      assert.ok(["api", "html", "text"].includes(bank.sourceKind))
      assert.ok(bank.rateTypes.length > 0)
      assert.ok(bank.rateTypes.every((type) => type === "spot" || type === "cash"))
    }
  })

  test("documents every exchange exactly once in the provider table", async () => {
    const documentation = await readFile("docs/providers.md", "utf8")
    for (const exchange of exchanges) {
      assert.equal(documentation.split(`\`${exchange}\``).length - 1, 1)
    }
  })
})
