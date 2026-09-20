import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import { describe, test } from "vitest"
import { webScript } from "../src/web.js"

class Element {
  children: Element[] = []
  hidden = true
  textContent = ""
  className = ""
  value = ""
  attributes = new Map<string, string>()
  listeners = new Map<string, (event: { preventDefault: () => void }) => Promise<void>>()

  addEventListener(
    event: string,
    listener: (event: { preventDefault: () => void }) => Promise<void>,
  ) {
    this.listeners.set(event, listener)
  }

  append(child: Element) {
    this.children.push(child)
  }

  replaceChildren() {
    this.children = []
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
}

const rate = {
  cashBuy: 30,
  cashSell: 33,
  exchange: "BANK_OF_TAIWAN",
  spotBuy: 31,
  spotSell: 32,
}

function browserPage(fetch: (path: string) => Promise<Response>) {
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
      "#action",
      "#top",
    ].map((selector) => [selector, new Element()]),
  )
  const element = (selector: string) => {
    const found = elements.get(selector)
    assert.ok(found)
    return found
  }
  element("#type").value = "spot"
  element("#currency").value = "USD"
  element("#action").value = "buy"
  element("#top").value = "10"
  runInNewContext(webScript, {
    document: {
      createElement: () => new Element(),
      querySelector: element,
    },
    fetch,
    FormData: class {
      values = new Map(
        ["type", "currency", "action", "top"].map((name) => [name, element(`#${name}`).value]),
      )
      get(name: string) {
        return this.values.get(name)
      }
    },
    URLSearchParams,
  })
  const dispatch = (selector: string, event: string) => {
    const listener = element(selector).listeners.get(event)
    assert.ok(listener)
    return listener({ preventDefault: () => {} })
  }
  return {
    click: () => dispatch("#history-button", "click"),
    submit: () => dispatch("#query-form", "submit"),
    element,
  }
}

function historyPage(rateType: string, rates: readonly object[]) {
  const page = browserPage(async () =>
    Response.json({ records: [{ recordedAt: "2026-09-20T12:00:00.000Z", rates }] }),
  )
  page.element("#type").value = rateType
  return page
}

function pendingPage() {
  const requests: Array<{
    path: string
    resolve: (response: Response) => void
    reject: (error: Error) => void
  }> = []
  const page = browserPage(
    (path) => new Promise<Response>((resolve, reject) => requests.push({ path, resolve, reject })),
  )
  return { ...page, requests }
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

describe("web requests", () => {
  test.each([
    ["cash", "spot", "30", "33"],
    ["spot", "cash", "31", "32"],
  ])(
    "renders the requested %s quotes after changing the selector to %s",
    async (type, next, buy, sell) => {
      const page = pendingPage()
      page.element("#type").value = type
      const pending = page.submit()
      assert.equal(
        new URL(page.requests[0]?.path ?? "", "http://localhost").searchParams.get("type"),
        type,
      )
      page.element("#type").value = next
      page.requests[0]?.resolve(Response.json({ rates: [rate], failures: [] }))
      await pending
      const cells = page.element("#rates tbody").children[0]?.children
      assert.equal(cells?.[1]?.textContent, buy)
      assert.equal(cells?.[2]?.textContent, sell)
    },
  )

  test.each([
    ["rates", "rates"],
    ["history", "history"],
    ["rates", "history"],
    ["history", "rates"],
  ])("only the latest action renders when %s is followed by %s", async (older, newer) => {
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const page = pendingPage()
      const first = older === "rates" ? page.submit() : page.click()
      page.element("#currency").value = "JPY"
      const last = newer === "rates" ? page.submit() : page.click()
      const pending = [first, last]
      for (const index of order) {
        const rates = [{ ...rate, exchange: index === 0 ? "OLD_BANK" : "NEW_BANK" }]
        page.requests[index]?.resolve(
          Response.json({ rates, failures: [], records: [{ rates, recordedAt: "snapshot" }] }),
        )
        await pending[index]
        if (index === 0 && order[0] === 0) {
          assert.equal(page.element("#rates tbody").children.length, 0)
          assert.equal(page.element("#history tbody").children.length, 0)
          assert.match(page.element("#status").textContent, /載入/)
        }
      }
      const rows = page.element(`#${newer} tbody`).children
      assert.equal(rows.length, 1)
      assert.equal(rows[0]?.children[newer === "rates" ? 0 : 1]?.textContent, "NEW_BANK")
      if (older !== newer) assert.equal(page.element(`#${older} tbody`).children.length, 0)
      assert.equal(
        page.element("#status").textContent,
        newer === "rates" ? "查詢完成" : "歷史載入完成",
      )
    }
  })

  test.each(["rates", "history"])(
    "ignores a stale %s error after a newer successful rate response",
    async (older) => {
      const page = pendingPage()
      const old = older === "rates" ? page.submit() : page.click()
      const current = page.submit()
      page.requests[1]?.resolve(Response.json({ rates: [rate], failures: [{}] }))
      await current
      const status = page.element("#status").textContent
      page.requests[0]?.reject(new Error("stale failure"))
      await old
      assert.equal(page.element("#status").textContent, status)
      assert.equal(page.element("#status").className, "warning")
      assert.equal(page.element("#status").attributes.has("role"), false)
      assert.equal(page.element("#rates tbody").children.length, 1)
    },
  )

  test.each(["rates", "history"])(
    "ignores a stale %s success after a newer failed rate response",
    async (older) => {
      const page = pendingPage()
      const old = older === "rates" ? page.submit() : page.click()
      const current = page.submit()
      page.requests[1]?.resolve(Response.json({ error: "current failure" }, { status: 503 }))
      await current
      page.requests[0]?.resolve(
        Response.json({
          rates: [rate],
          failures: [],
          records: [{ rates: [rate], recordedAt: "stale" }],
        }),
      )
      await old
      assert.equal(page.element("#history tbody").children.length, 0)
      assert.equal(page.element("#status").textContent, "current failure")
      assert.equal(page.element("#status").attributes.get("role"), "alert")
      assert.equal(page.element("#rates tbody").children.length, 0)
    },
  )
})
