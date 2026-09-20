# taiwan-exchange-rates 🇹🇼

以 TypeScript 查詢並比較台灣銀行的即時外幣兌新台幣牌告匯率，可作為 library 或 CLI 使用。

- 支援 17 家銀行。
- 統一即期／現鈔買進與賣出欄位。
- 全銀行並行查詢，單一銀行失敗不影響其他結果。
- 提供 midpoint、spread 與 currency pair helper。
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

## CLI

查詢所有銀行的 USD/TWD，結果依即期點差排序：

```sh
twrate USD
```

查詢單一銀行或輸出 JSON：

```sh
twrate JPY --bank bot
twrate EUR --bank ESUN_BANK --json
twrate --list-banks
```

銀行參數可使用 `--list-banks` 顯示的 exchange identifier，或 `bot`、`dbs`、`sinopac`、`esun`、`line` 等簡稱。

## Library

### 查詢單一銀行

```ts
import { fetchRates, spotMid, spotSpread } from "taiwan-exchange-rates"

const rates = await fetchRates("BANK_OF_TAIWAN")
const usd = rates.find((rate) => rate.source === "USD")

if (usd) {
  console.log(usd.spotBuy, usd.spotSell)
  console.log(spotMid(usd), spotSpread(usd))
}
```

未指定銀行時，`fetchRates()` 預設查詢台灣銀行。

### 並行查詢所有銀行

```ts
import { fetchAllRates } from "taiwan-exchange-rates"

const rates = await fetchAllRates({
  timeoutMs: 10_000,
  onError: (exchange, error) => {
    console.error(`${exchange} failed`, error)
  },
})

const usdRates = rates.filter((rate) => rate.source === "USD")
```

也可透過 `exchanges` 限制銀行：

```ts
const rates = await fetchAllRates({
  exchanges: ["BANK_OF_TAIWAN", "BANK_SINOPAC", "ESUN_BANK"],
})
```

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

銀行未提供、空白、`-` 或零值不會被當成有效匯率，對應欄位會省略。`fetchedAt` 是 ISO 8601 字串。

可用 helper：

- `spotMid(rate)` / `cashMid(rate)`
- `spotSpread(rate)` / `cashSpread(rate)`
- `symbol(rate)`
- `normalizeCurrencyCode(value)` / `parseRateNumber(value)`

## 支援銀行

| Exchange | 銀行 |
| --- | --- |
| `BANK_OF_TAIWAN` | 台灣銀行 |
| `DBS_BANK` | 星展銀行 |
| `BANK_SINOPAC` | 永豐銀行 |
| `ESUN_BANK` | 玉山銀行 |
| `LINE_BANK` | LINE Bank |
| `HSBC_BANK` | 匯豐銀行 |
| `NEXT_BANK` | 將來銀行 |
| `KGI_BANK` | 凱基銀行 |
| `CATHAY_BANK` | 國泰世華銀行 |
| `MEGA_BANK` | 兆豐銀行 |
| `FIRST_BANK` | 第一銀行 |
| `LAND_BANK` | 土地銀行 |
| `YUANTA_BANK` | 元大銀行 |
| `TAISHIN_BANK` | 台新銀行 |
| `TAICHUNG_BANK` | 台中銀行 |
| `COOPERATIVE_BANK` | 合作金庫 |
| `FUBON_BANK` | 台北富邦銀行 |

各銀行公開頁面與 API 的可用性、幣別及欄位不同，可能暫時無法連線。台灣銀行等站點需要 browser TLS fingerprint，本套件使用 `impit` 處理。

## 開發

```sh
npm install
npm run ci
npm run build
node dist/cli.js USD --bank bot
```

`npm run ci` 會執行 Biome、Vitest 與 TypeScript build。

## License

[AGPL-3.0-only](LICENSE)
