import assert from "node:assert/strict"
import { describe, expect, test } from "vitest"
import type { Exchange, Rate } from "../src/index.js"
import {
  extractCooperativeBankToken,
  parseBankOfTaiwanRates,
  parseCathayRates,
  parseCooperativeBankRates,
  parseDbsRates,
  parseEsunRates,
  parseFirstBankRates,
  parseFubonRates,
  parseHsbcRates,
  parseKgiRates,
  parseLandBankRates,
  parseLineBankRates,
  parseMegaBankRates,
  parseNextBankRates,
  parseSinopacRates,
  parseTaichungBankRates,
  parseTaishinRates,
  parseYuantaBankRates,
} from "../src/index.js"

const fetchedAt = new Date("2026-09-20T12:00:00.000Z")
const botText = `﻿幣別 匯率 現金 即期 遠期10天 遠期30天 遠期60天 遠期90天 遠期120天 遠期150天 遠期180天 匯率 現金 即期
USD 本行買入 31.40000 31.72500 - - - - - - - 本行賣出 32.07000 31.87500`

describe("API response parsers", () => {
  test("parses the Bank of Taiwan text board defensively", () => {
    const rates = parseBankOfTaiwanRates(botText, fetchedAt)
    assertRateContract(rates, "BANK_OF_TAIWAN")
    assert.deepEqual(rates[0], {
      cashBuy: 31.4,
      cashSell: 32.07,
      exchange: "BANK_OF_TAIWAN",
      fetchedAt: fetchedAt.toISOString(),
      source: "USD",
      spotBuy: 31.725,
      spotSell: 31.875,
      target: "TWD",
    })
    expect(() => parseBankOfTaiwanRates("", fetchedAt)).toThrow("empty")
    expect(() => parseBankOfTaiwanRates("<html>challenge</html>", fetchedAt)).toThrow("anti-bot")
  })

  test("merges SinoPac spot and cash boards", () => {
    const payload = (buy: string, sell: string) => [
      {
        Header: "SUCCESS",
        SubInfo: [{ DataValue2: buy, DataValue3: sell, DataValue4: "USD" }],
      },
    ]
    const rates = parseSinopacRates(payload("31.7", "31.9"), payload("31.4", "32.1"), fetchedAt)
    assertRateContract(rates, "BANK_SINOPAC")
    const usd = rates[0]
    assert.deepEqual(usd, {
      cashBuy: 31.4,
      cashSell: 32.1,
      exchange: "BANK_SINOPAC",
      fetchedAt: fetchedAt.toISOString(),
      source: "USD",
      spotBuy: 31.7,
      spotSell: 31.9,
      target: "TWD",
    })
  })

  test("parses DBS and E.SUN nested payloads", () => {
    const dbs = parseDbsRates(
      { results: { assets: [{ recData: [{ currency: "USD", ttBuy: "31", ttSell: "32" }] }] } },
      fetchedAt,
    )
    const esun = parseEsunRates(
      {
        Rates: [
          {
            BBoardRate: "31",
            CashBBoardRate: "30.5",
            CashSBoardRate: "32.5",
            CCY: " usd / twd ",
            SBoardRate: "32",
          },
        ],
      },
      fetchedAt,
    )
    assertRateContract(dbs, "DBS_BANK")
    assertRateContract(esun, "ESUN_BANK")
    assert.equal(dbs[0]?.exchange, "DBS_BANK")
    assert.equal(dbs[0]?.spotBuy, 31)
    assert.equal(esun[0]?.source, "USD")
    assert.equal(esun[0]?.cashSell, 32.5)
  })

  test("parses and normalizes the remaining JSON APIs", () => {
    const next = parseNextBankRates(
      { data: { currencyList: [{ buyRate: "32", currency: "USD", sellRate: "31" }] } },
      fetchedAt,
    )
    const mega = parseMegaBankRates(
      {
        rates: [
          { cash: { ask: "33", bid: "30" }, currKey: "USD|美元", spot: { ask: "32", bid: "31" } },
        ],
      },
      fetchedAt,
    )
    const taichung = parseTaichungBankRates(
      {
        appRepBody: {
          exchangeRates: [
            {
              cashExchangeRate: { buy: "30", sale: "33" },
              currency: "USD",
              spotExchangeRate: { buy: "31", sale: "32" },
            },
          ],
        },
      },
      fetchedAt,
    )
    const fubon = parseFubonRates(
      { FE_data: [{ Spot_BUY: "31", Spot_SELL: "32", currencyEname: "USD" }] },
      fetchedAt,
    )
    const cooperative = parseCooperativeBankRates(
      {
        result: [
          { CashExchange: "30", Currency: "USD", PromptExchange: "31", Type: "買入" },
          { CashExchange: "33", Currency: "USD", PromptExchange: "32", Type: "賣出" },
        ],
      },
      fetchedAt,
    )

    assertRateContract(next, "NEXT_BANK")
    assertRateContract(mega, "MEGA_BANK")
    assertRateContract(taichung, "TAICHUNG_BANK")
    assertRateContract(fubon, "FUBON_BANK")
    assertRateContract(cooperative, "COOPERATIVE_BANK")
    assert.equal(next[0]?.spotBuy, 31)
    assert.equal(next[0]?.spotSell, 32)
    for (const rates of [mega, taichung, cooperative]) {
      assert.equal(rates[0]?.cashBuy, 30)
      assert.equal(rates[0]?.cashSell, 33)
    }
    assert.equal(fubon[0]?.spotSell, 32)
  })
})

describe("HTML response parsers", () => {
  test("parses LINE Bank, HSBC, Land Bank, and Yuanta tables", () => {
    const line = parseLineBankRates(
      "<table><tbody><tr><td>美元 USD</td><td>31</td><td>32</td></tr></tbody></table>",
      fetchedAt,
    )
    const hsbc = parseHsbcRates(
      "<table><tbody><tr><td>US Dollar (USD)</td><td>31</td><td>32</td><td>30</td><td>33</td></tr></tbody></table>",
      fetchedAt,
    )
    const fiveColumns =
      "<table><tr><td>美元 (USD)</td><td>31</td><td>32</td><td>30</td><td>33</td></tr></table>"
    const land = parseLandBankRates(fiveColumns, fetchedAt)
    const yuanta = parseYuantaBankRates(fiveColumns, fetchedAt)

    assertRateContract(line, "LINE_BANK")
    assertRateContract(hsbc, "HSBC_BANK")
    assertRateContract(land, "LAND_BANK")
    assertRateContract(yuanta, "YUANTA_BANK")
    assert.equal(line[0]?.spotBuy, 31)
    for (const rates of [hsbc, land, yuanta]) assert.equal(rates[0]?.cashSell, 33)
  })

  test("merges First Bank rows from both public rate boards", () => {
    const rates = parseFirstBankRates(
      `<table>
        <tr><td>美元 (USD)</td><td>即期</td><td>31</td><td>32</td></tr>
        <tr><td>美元 (USD)</td><td>現鈔</td><td>30</td><td>33</td></tr>
        <tr><td>EUR</td><td>Spot</td><td>35</td><td>36</td></tr>
        <tr><td>EUR</td><td>Cash</td><td>34</td><td>37</td></tr>
      </table>`,
      fetchedAt,
    )
    assertRateContract(rates, "FIRST_BANK")
    assert.equal(rates[0]?.spotBuy, 31)
    assert.equal(rates[0]?.cashSell, 33)
    assert.equal(rates[1]?.source, "EUR")
    assert.equal(rates[1]?.spotBuy, 35)
    assert.equal(rates[1]?.cashSell, 37)
  })

  test("parses KGI and Cathay component markup", () => {
    const kgi = parseKgiRates(
      `<div class="kgibOtherCus004__item">
        <span class="currency-en-name">USD</span>
        <div class="kgibOtherCus004__item-val"><span>31</span></div>
        <div class="kgibOtherCus004__item-val"><span>32</span></div>
        <div class="kgibOtherCus004__item-val"><span>30</span></div>
        <div class="kgibOtherCus004__item-val"><span>33</span></div>
      </div>`,
      fetchedAt,
    )
    const cathay = parseCathayRates(
      `<div class="cubre-o-table__item currency">
        <div class="cubre-m-currency__name">美元USD</div>
        <table><tbody>
          <tr><td>即期匯率</td><td>31</td><td>32</td></tr>
          <tr><td>現鈔匯率</td><td>30</td><td>33</td></tr>
        </tbody></table>
      </div>`,
      fetchedAt,
    )
    assertRateContract(kgi, "KGI_BANK")
    assertRateContract(cathay, "CATHAY_BANK")
    for (const rates of [kgi, cathay]) assert.equal(rates[0]?.cashSell, 33)
  })

  test("decodes the Taishin export script and Cooperative Bank token", () => {
    const taishin = parseTaishinRates(
      `document.writeln('<table><tr><th>即期買入</th><th>即期賣出</th><th>現鈔買入</th><th>現鈔賣出</th></tr><tr><td><a onclick="queryhistory(\\'USD\\')">USD</a></td><td>31</td><td>32</td><td>30</td><td>33</td></tr></table>');`,
      fetchedAt,
    )
    assertRateContract(taishin, "TAISHIN_BANK")
    assert.equal(taishin[0]?.source, "USD")
    assert.equal(taishin[0]?.cashSell, 33)
    assert.equal(
      extractCooperativeBankToken(
        '<form data-form-id="spotrate"><input name="__RequestVerificationToken" value="token"></form>',
      ),
      "token",
    )
  })

  test("rejects pages without usable rate rows", () => {
    expect(() => parseLineBankRates("<html></html>", fetchedAt)).toThrow("No LINE Bank")
    expect(() =>
      parseLandBankRates(
        "<table><tr><td>美元 (USD)</td><td>-</td><td>-</td><td>-</td><td>-</td></tr></table>",
        fetchedAt,
      ),
    ).toThrow("No Land Bank")
  })
})

function assertRateContract(rates: readonly Rate[], exchange: Exchange): void {
  assert.ok(rates.length > 0)
  for (const rate of rates) {
    assert.equal(rate.exchange, exchange)
    assert.equal(rate.target, "TWD")
    assert.match(rate.source, /^[A-Z]{3}$/)
    assert.equal(new Date(rate.fetchedAt).toISOString(), rate.fetchedAt)
    const values = [rate.spotBuy, rate.spotSell, rate.cashBuy, rate.cashSell]
    assert.ok(values.some((value) => value !== undefined))
    assert.ok(values.every((value) => value === undefined || (Number.isFinite(value) && value > 0)))
  }
}
