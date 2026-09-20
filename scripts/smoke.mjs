import { writeFile } from "node:fs/promises"
import process from "node:process"
import { exchanges, fetchRates } from "../dist/index.js"

const outputIndex = process.argv.indexOf("--output")
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
const startedAt = new Date().toISOString()
const results = await Promise.all(
  exchanges.map(async (exchange) => {
    const start = performance.now()
    try {
      const rates = await fetchRates(exchange, { timeoutMs: 30_000 })
      assertRates(exchange, rates)
      return {
        currencies: [...new Set(rates.map((rate) => rate.source))].sort(),
        durationMs: Math.round(performance.now() - start),
        exchange,
        rateCount: rates.length,
        status: "ok",
      }
    } catch (error) {
      return {
        durationMs: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
        exchange,
        status: "failed",
      }
    }
  }),
)
const report = { finishedAt: new Date().toISOString(), results, startedAt }
const json = `${JSON.stringify(report, null, 2)}\n`
process.stdout.write(json)
if (outputPath) await writeFile(outputPath, json, "utf8")
if (results.some((result) => result.status === "failed")) process.exitCode = 1

function assertRates(exchange, rates) {
  if (!Array.isArray(rates) || rates.length === 0) throw new Error("No rates returned")
  for (const rate of rates) {
    if (rate.exchange !== exchange) throw new Error(`Unexpected exchange ${rate.exchange}`)
    if (rate.target !== "TWD") throw new Error(`Unexpected target ${rate.target}`)
    if (!/^[A-Z]{3}$/.test(rate.source)) throw new Error(`Invalid currency ${rate.source}`)
    if (new Date(rate.fetchedAt).toISOString() !== rate.fetchedAt) {
      throw new Error(`Invalid fetchedAt ${rate.fetchedAt}`)
    }
    const values = [rate.spotBuy, rate.spotSell, rate.cashBuy, rate.cashSell]
    if (!values.some((value) => value !== undefined)) throw new Error("Rate has no quote")
    if (!values.every((value) => value === undefined || (Number.isFinite(value) && value > 0))) {
      throw new Error("Rate contains an invalid quote")
    }
  }
}
