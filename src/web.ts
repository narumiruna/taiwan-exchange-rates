export const webPage = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>台灣銀行匯率比較</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 72rem; padding: 1rem; }
    form { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; }
    label { display: grid; gap: .35rem; font-weight: 600; }
    input, select, button { font: inherit; padding: .55rem; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; margin-top: 1rem; width: 100%; }
    th, td { border-bottom: 1px solid #8888; padding: .6rem; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    #status[role="alert"] { color: #b42318; }
    .warning { color: #9a6700; }
  </style>
</head>
<body>
  <main>
    <h1>台灣銀行匯率比較</h1>
    <p>買入、賣出皆以顧客角度表示；顧客買入使用銀行賣出價。</p>
    <form id="query-form">
      <label>幣別 <input id="currency" name="currency" value="USD" pattern="[A-Za-z]{3}" required></label>
      <label>動作 <select id="action" name="action"><option value="buy">買入外幣</option><option value="sell">賣出外幣</option></select></label>
      <label>類型 <select id="type" name="type"><option value="spot">即期</option><option value="cash">現鈔</option></select></label>
      <label>顯示筆數 <input id="top" name="top" type="number" min="1" max="100" value="10"></label>
      <button type="submit">查詢</button>
      <button id="history-button" type="button">讀取歷史</button>
    </form>
    <p id="status" aria-live="polite"></p>
    <div class="table-wrap"><table id="rates"><thead><tr><th>銀行</th><th>買進</th><th>賣出</th><th>抓取時間</th></tr></thead><tbody></tbody></table></div>
    <section id="history-section" hidden><h2>歷史紀錄</h2><div class="table-wrap"><table id="history"><thead><tr><th>記錄時間</th><th>銀行</th><th>買進</th><th>賣出</th></tr></thead><tbody></tbody></table></div></section>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`

export const webScript = `
const form = document.querySelector("#query-form")
const status = document.querySelector("#status")
const ratesBody = document.querySelector("#rates tbody")
const historyBody = document.querySelector("#history tbody")
const historySection = document.querySelector("#history-section")
let requestGeneration = 0

function parameters() {
  const data = new FormData(form)
  const params = new URLSearchParams()
  params.append("currency", String(data.get("currency") || "").trim().toUpperCase())
  params.set("action", String(data.get("action")))
  params.set("type", String(data.get("type")))
  params.set("top", String(data.get("top")))
  return params
}

function cell(row, value) {
  const td = document.createElement("td")
  td.textContent = value === undefined ? "-" : String(value)
  row.append(td)
}

async function request(path) {
  const response = await fetch(path)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Request failed")
  return body
}

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  const generation = ++requestGeneration
  status.removeAttribute("role")
  status.className = ""
  status.textContent = "載入中…"
  ratesBody.replaceChildren()
  try {
    const params = parameters()
    const rateType = params.get("type")
    const body = await request("/api/rates?" + params)
    if (generation !== requestGeneration) return
    if (body.rates.length === 0) {
      status.textContent = "沒有可用的匯率。" + (body.failures.length ? body.failures.length + " 家銀行查詢失敗。" : "")
      status.className = "warning"
      return
    }
    for (const rate of body.rates) {
      const row = document.createElement("tr")
      cell(row, rate.exchange)
      cell(row, rateType === "cash" ? rate.cashBuy : rate.spotBuy)
      cell(row, rateType === "cash" ? rate.cashSell : rate.spotSell)
      cell(row, rate.fetchedAt)
      ratesBody.append(row)
    }
    status.textContent = body.failures.length ? body.failures.length + " 家銀行查詢失敗，其餘結果仍可使用。" : "查詢完成"
    if (body.failures.length) status.className = "warning"
  } catch (error) {
    if (generation !== requestGeneration) return
    status.setAttribute("role", "alert")
    status.textContent = error instanceof Error ? error.message : String(error)
  }
})

document.querySelector("#history-button").addEventListener("click", async () => {
  const generation = ++requestGeneration
  status.removeAttribute("role")
  status.className = ""
  status.textContent = "載入歷史…"
  historyBody.replaceChildren()
  try {
    const rateType = document.querySelector("#type").value
    const body = await request("/api/history?currency=" + encodeURIComponent(document.querySelector("#currency").value.toUpperCase()))
    if (generation !== requestGeneration) return
    for (const record of body.records) {
      for (const rate of record.rates) {
        const row = document.createElement("tr")
        cell(row, record.recordedAt)
        cell(row, rate.exchange)
        cell(row, rateType === "cash" ? rate.cashBuy : rate.spotBuy)
        cell(row, rateType === "cash" ? rate.cashSell : rate.spotSell)
        historyBody.append(row)
      }
    }
    historySection.hidden = false
    status.textContent = "歷史載入完成"
  } catch (error) {
    if (generation !== requestGeneration) return
    status.setAttribute("role", "alert")
    status.textContent = error instanceof Error ? error.message : String(error)
  }
})
`
