# taiwan-exchange-rates 🇹🇼

[![CI](https://github.com/narumiruna/taiwan-exchange-rates/actions/workflows/ci.yml/badge.svg)](https://github.com/narumiruna/taiwan-exchange-rates/actions/workflows/ci.yml)
[![Live provider smoke](https://github.com/narumiruna/taiwan-exchange-rates/actions/workflows/live-smoke.yml/badge.svg)](https://github.com/narumiruna/taiwan-exchange-rates/actions/workflows/live-smoke.yml)
[![npm](https://img.shields.io/npm/v/taiwan-exchange-rates)](https://www.npmjs.com/package/taiwan-exchange-rates)

以 TypeScript 查詢並比較台灣 17 家銀行的外幣兌新台幣牌告匯率，可作為 library、CLI、本機 HTTP API 或簡易網頁使用。

- 統一即期／現鈔買進與賣出欄位。
- 依顧客買入或賣出外幣的實際可執行價格排名。
- 全銀行並行查詢；單一銀行失敗不影響其他結果。
- 提供 structured failures、process-local cache、併發與 provider 啟動間隔控制。
- 可保存 JSONL 歷史、檢查價格門檻並提供唯讀 HTTP API。
- 支援自訂 `fetch`、timeout 與時間來源，方便測試及整合。

## 安裝

需要 Node.js 20.18.1 以上版本。

```sh
npm install taiwan-exchange-rates
```

全域安裝 CLI：

```sh
npm install --global taiwan-exchange-rates
```

## CLI quick start

```sh
# 原有用法：依即期點差比較 USD
twrate USD

# 顧客買入外幣：銀行即期賣出價由低到高，每個幣別前五名
twrate USD JPY --action buy --type spot --top 5

# 顧客賣出現鈔：銀行現鈔買進價由高到低
twrate EUR --action sell --type cash

# 單一銀行、JSON、CSV
twrate JPY --bank bot
twrate EUR --bank ESUN_BANK --format json
twrate USD JPY --format csv

# Metadata 與目前幣別
twrate --list-banks --format json
twrate --list-currencies
twrate --list-currencies --bank sinopac
```

銀行參數可使用 `--list-banks` 顯示的 exchange identifier，或 `bot`、`dbs`、`sinopac`、`esun`、`line` 等簡稱。`--json` 仍可使用，是 `--format json` 的相容 alias。

### CLI reference

| Option / command | 說明 | 預設 |
| --- | --- | --- |
| `<currency...>` | 一個以上三碼幣別 | 必填 |
| `-b, --bank <bank>` | 只查一家銀行 | 全部 |
| `--action buy\|sell` | 顧客買入／賣出外幣 | 無 |
| `--type spot\|cash` | 牌價種類 | `spot` |
| `--sort price\|spread` | 每個幣別排序；`price` 需要 action | 有 action 時 `price`，否則 `spread` |
| `--top <n>` | 每個幣別保留前 N 家 | 全部 |
| `--format table\|json\|csv` | 輸出格式 | `table` |
| `--timeout <ms>` | 每個 HTTP request timeout | `30000` |
| `--cache-ttl <ms>` | 成功結果的 process-local TTL cache | `0`（關閉） |
| `--max-concurrency <n>` | 同時執行的 provider 數量 | 全部 |
| `--min-start-interval <ms>` | provider 啟動的最小間隔 | `0` |
| `--history-file <path>` | 明確寫入／讀取 JSONL | 不寫入 |
| `history` | 依幣別、銀行、時間與 limit 讀取 history | — |
| `alert` | 檢查買入／賣出門檻 | — |
| `serve` | 啟動本機 HTTP API 與 web UI | `127.0.0.1:3000` |

一般查詢成功為 `0`、沒有資料或 request 失敗為 `1`、參數錯誤為 `2`。`alert` 的 `0` 表示門檻觸發、`1` 表示未觸發或沒有可執行牌價、`2` 表示參數錯誤。

完整用法：

- [History 與 alerts](docs/history-and-alerts.md)
- [HTTP API 與 web UI](docs/http-api.md)
- [17 家 provider、觀測幣別與限制](docs/providers.md)

## Library

### 查詢單一銀行

```ts
import { fetchRates, spotMid, spotSpread } from "taiwan-exchange-rates"

const rates = await fetchRates("BANK_OF_TAIWAN", { timeoutMs: 10_000 })
const usd = rates.find((rate) => rate.source === "USD")

if (usd) {
  console.log(usd.spotBuy, usd.spotSell)
  console.log(spotMid(usd), spotSpread(usd))
}
```

未指定銀行時，`fetchRates()` 預設查詢台灣銀行。

### 並行查詢與 structured failures

既有 `fetchAllRates()` 仍回傳成功的 `Rate[]`，並可由 `onError` 接收部分失敗：

```ts
import { fetchAllRates } from "taiwan-exchange-rates"

const rates = await fetchAllRates({
  exchanges: ["BANK_OF_TAIWAN", "BANK_SINOPAC", "ESUN_BANK"],
  timeoutMs: 10_000,
  onError: (exchange, error) => console.error(exchange, error),
})
```

需要同時保存成功與失敗時使用 additive API：

```ts
import { fetchAllRatesDetailed } from "taiwan-exchange-rates"

const { rates, failures } = await fetchAllRatesDetailed()
```

所有 fresh provider 在同一次 `fetchAllRates*()` 呼叫會共用 `fetchedAt`。單一銀行失敗不會讓其他銀行資料消失，且 provider 不會自動 retry。

### 顧客情境排名

`buy`／`sell` 都站在顧客角度：顧客買入外幣使用銀行 `sell` 價且越低越好；顧客賣出外幣使用銀行 `buy` 價且越高越好。spread 只表示買賣價差，不等同顧客拿到的最佳成交價。

```ts
import { bestRate, queryRates } from "taiwan-exchange-rates"

const ranked = queryRates(rates, {
  action: "buy",
  currencies: ["USD", "JPY"],
  rateType: "spot",
  sort: "price",
  top: 3,
})
const bestUsdCash = bestRate(
  rates.filter((rate) => rate.source === "USD"),
  "buy",
  "cash",
)
```

可用 pure helper：`rateField()`、`executablePrice()`、`filterRates()`、`groupRates()`、`sortRates()`、`queryRates()` 與 `bestRate()`。

### Cache 與 provider scheduling

```ts
import { createRateClient } from "taiwan-exchange-rates"

const client = createRateClient({
  cacheTtlMs: 60_000,
  maxConcurrency: 4,
  minStartIntervalMs: 100,
  timeoutMs: 10_000,
})
const result = await client.fetchAllRatesDetailed()
client.clearCache()
```

Cache 只保存成功結果、會合併同一銀行的 concurrent miss，且只存在目前 process；restart 或另一個 process 不共享。TTL 預設為 `0`（關閉），provider concurrency 預設不限制，啟動間隔預設 `0`。失敗不 cache，也不 retry。

### `Rate` model

```ts
type Rate = Readonly<{
  exchange: Exchange
  fetchedAt: string
  source: string
  target: string
  spotBuy?: number
  spotSell?: number
  cashBuy?: number
  cashSell?: number
}>
```

`buy`／`sell` 欄位站在銀行角度。銀行未提供、空白、`-` 或零值不會被當成有效匯率，對應欄位會省略。`fetchedAt` 是本套件抓取時間的 ISO 8601 字串，**不一定是銀行牌告更新時間**。

衍生 helper：

- `spotMid(rate)` / `cashMid(rate)`
- `spotSpread(rate)` / `cashSpread(rate)`
- `symbol(rate)`
- `normalizeCurrencyCode(value)` / `parseRateNumber(value)`

## 支援銀行

支援台灣銀行、星展、永豐、玉山、LINE Bank、匯豐、將來、凱基、國泰世華、兆豐、第一、土地、元大、台新、台中、合作金庫及台北富邦。完整 identifier、官方牌告網址、當次觀測幣別與 anti-bot 限制見 [Provider reference](docs/providers.md)。

各銀行公開頁面與 API 的可用性、幣別及欄位不同，可能暫時無法連線。部分站點需要 browser TLS fingerprint，本套件會在需要時延遲載入 `impit`；自訂 `fetch` 時不載入。

## 開發與可靠性

```sh
npm install
npm run ci              # Biome、Vitest、TypeScript、文件連結
npm run package:smoke   # npm pack、乾淨安裝、subpath import、CLI
npm run smoke           # 實際查詢全部 17 家銀行
node dist/cli.js USD --bank bot
```

Deterministic CI 在最低支援 Node.js 20.18.1 與 Node.js 26 執行。每日 live smoke 會輸出逐銀行 JSON artifact，任何銀行失敗或沒有有效匯率時失敗；由於上游維護可能造成短暫紅燈，診斷時應查看 artifact，而不是降低 parser contract 或隱藏失敗。

## License

[AGPL-3.0-only](LICENSE)
