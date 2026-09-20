import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"

const root = resolve(import.meta.dirname, "..")
const temporary = mkdtempSync(join(tmpdir(), "twrate-package-"))

try {
  const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", temporary], {
    cwd: root,
    encoding: "utf8",
  })
  const packed = JSON.parse(packOutput)[0]
  if (!packed?.filename || !Array.isArray(packed.files))
    throw new Error("npm pack returned no files")
  const paths = packed.files.map((file) => file.path)
  for (const required of [
    "LICENSE",
    "README.md",
    "dist/cli.js",
    "dist/history.d.ts",
    "dist/index.d.ts",
    "dist/server.d.ts",
    "package.json",
  ]) {
    if (!paths.includes(required)) throw new Error(`Packed package is missing ${required}`)
  }
  if (paths.some((path) => path.startsWith("src/") || path.startsWith("tests/"))) {
    throw new Error("Packed package contains source or test files")
  }

  execFileSync("npm", ["init", "--yes"], { cwd: temporary, stdio: "ignore" })
  const packageJson = join(temporary, "package.json")
  const initialized = JSON.parse(readFileSync(packageJson, "utf8"))
  initialized.type = "module"
  writeFileSync(packageJson, `${JSON.stringify(initialized, null, 2)}\n`)
  execFileSync("npm", ["install", join(temporary, packed.filename), "--ignore-scripts"], {
    cwd: temporary,
    stdio: "inherit",
  })
  writeFileSync(
    join(temporary, "smoke.mjs"),
    `import * as core from "taiwan-exchange-rates"
import * as history from "taiwan-exchange-rates/history"
import * as server from "taiwan-exchange-rates/server"
if (typeof core.fetchRates !== "function") throw new Error("missing root export")
if (typeof history.readHistory !== "function") throw new Error("missing history export")
if (typeof server.startServer !== "function") throw new Error("missing server export")
`,
  )
  execFileSync(process.execPath, [join(temporary, "smoke.mjs")], {
    cwd: temporary,
    stdio: "inherit",
  })
  const binary = join(temporary, "node_modules", ".bin", "twrate")
  execFileSync(binary, ["--help"], { cwd: temporary, stdio: "inherit" })
  console.log(`Package smoke passed (${paths.length} packed files).`)
} finally {
  rmSync(temporary, { force: true, recursive: true })
}
