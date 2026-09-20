import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import process from "node:process"

const root = resolve(import.meta.dirname, "..")
const files = process.argv.slice(2)
if (files.length === 0) throw new Error("Provide Markdown files to check")
const missing = []
for (const file of files) {
  const absolute = resolve(root, file)
  const markdown = readFileSync(absolute, "utf8")
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1]?.trim()
    if (!raw || raw.startsWith("#") || /^[a-z]+:/i.test(raw)) continue
    const path = decodeURIComponent(raw.split("#", 1)[0] ?? "")
    const target = path.startsWith("/")
      ? resolve(root, `.${path}`)
      : resolve(dirname(absolute), path)
    if (!existsSync(target)) missing.push(`${file}: ${raw}`)
  }
}
if (missing.length) throw new Error(`Missing local Markdown targets:\n${missing.join("\n")}`)
console.log(`Checked local links in ${files.length} Markdown files.`)
