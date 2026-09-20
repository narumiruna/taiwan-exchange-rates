import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import { describe, test } from "vitest"
import { webScript } from "../src/web.js"

class Element {
  children: Element[] = []
  hidden = true
  textContent = ""
  value = ""
  listeners = new Map<string, () => Promise<void>>()

  addEventListener(event: string, listener: () => Promise<void>) {
    this.listeners.set(event, listener)
  }

  append(child: Element) {
    this.children.push(child)
  }

  replaceChildren() {
    this.children = []
  }

  setAttribute() {}
}

const rate = {
  cashBuy: 30,
  cashSell: 33,
  exchange: "BANK_OF_TAIWAN",
  spotBuy: 31,
  spotSell: 32,
}

function historyPage(rateType: string, rates: readonly object[]) {
  const elements = new Map(
    [
      "#query-form",
      "#status",
      "#rates tbody",
      "#history tbody",
      "#history-section",
      "#history-button",
      "#type",
      "#currency",
    ].map((selector) => [selector, new Element()]),
  )
  const element = (selector: string) => {
    const found = elements.get(selector)
    assert.ok(found)
    return found
  }
  element("#type").value = rateType
  element("#currency").value = "USD"
  runInNewContext(webScript, {
    document: {
      createElement: () => new Element(),
      querySelector: element,
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ records: [{ recordedAt: "2026-09-20T12:00:00.000Z", rates }] }),
    }),
  })
  const click = element("#history-button").listeners.get("click")
  assert.ok(click)
  return { click, element }
}

describe("web history", () => {
  test.each([
    ["cash", "30", "33"],
    ["spot", "31", "32"],
  ])("renders only the selected %s quote type", async (type, buy, sell) => {
    const page = historyPage(type, [rate])
    await page.click()
    const cells = page.element("#history tbody").children[0]?.children
    assert.equal(cells?.[2]?.textContent, buy)
    assert.equal(cells?.[3]?.textContent, sell)
    assert.equal(page.element("#history-section").hidden, false)
  })

  test.each(["cash", "spot"])(
    "does not fall back when %s history quotes are missing",
    async (type) => {
      const otherType =
        type === "cash" ? { spotBuy: 31, spotSell: 32 } : { cashBuy: 30, cashSell: 33 }
      const page = historyPage(type, [{ exchange: "BANK_OF_TAIWAN", ...otherType }])
      await page.click()
      const cells = page.element("#history tbody").children[0]?.children
      assert.equal(cells?.[2]?.textContent, "-")
      assert.equal(cells?.[3]?.textContent, "-")
    },
  )

  test("captures the selected type before awaiting history", async () => {
    const page = historyPage("cash", [rate])
    const pending = page.click()
    page.element("#type").value = "spot"
    await pending
    assert.equal(page.element("#history tbody").children[0]?.children[2]?.textContent, "30")
  })
})
