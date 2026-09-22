# Provider reference

銀行公開資料的格式、幣別與可用性可能隨時改變。下表的幣別是 **2026-09-20 UTC** 執行 `npm run smoke` 的觀測結果，不是永久保證；請用 `twrate --list-currencies` 取得當下結果。

`api` 表示 provider 呼叫銀行的機器端點，`html` 表示解析公開網頁，`text` 表示解析文字牌告。`spot`／`cash` 代表銀行層級可能提供的欄位，個別幣別仍可能缺值。Root export `banks` 的元素型別是 `BankMetadata`；既有 `Bank` 型別保留相容欄位，新增 metadata 在該型別上是 optional。

| Exchange | 銀行 | 來源 | 牌價 | 官方牌告 | 當次觀測幣別 |
| --- | --- | --- | --- | --- | --- |
| `BANK_OF_TAIWAN` | 台灣銀行 | text | spot, cash | [牌告匯率](https://rate.bot.com.tw/xrt?Lang=zh-TW) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, IDR, JPY, KRW, MYR, NZD, PHP, SEK, SGD, THB, USD, VND, ZAR |
| `DBS_BANK` | 星展銀行 | api | spot, cash | [外幣匯率](https://www.dbs.com.tw/personal-zh/rates/foreign-exchange-rates.page) | AUD, CAD, CHF, CNH, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |
| `BANK_SINOPAC` | 永豐銀行 | api | spot, cash | [牌告匯率](https://bank.sinopac.com/MMA8/bank/html/rate/bank_ExchangeRate.html) | AUD, CAD, CHF, CNH, CNY, EUR, GBP, HKD, JPY, MOP, NZD, SEK, SGD, THB, USD, ZAR |
| `ESUN_BANK` | 玉山銀行 | api | spot, cash | [外幣匯率](https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates) | AUD, CAD, CHF, CNH, CNY, EUR, GBP, HKD, JPY, MXN, NZD, SEK, SGD, THB, USD, ZAR |
| `LINE_BANK` | LINE Bank | html | spot | [外幣匯率](https://www.linebank.com.tw/board-rate/exchange-rate) | USD |
| `HSBC_BANK` | 匯豐銀行 | html | spot, cash | [外幣匯率](https://www.hsbc.com.tw/currency-rates/) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, USD, ZAR |
| `NEXT_BANK` | 將來銀行 | api | spot | [外幣匯率](https://www.nextbank.com.tw/rate) | EUR, JPY, USD |
| `KGI_BANK` | 凱基銀行 | html | spot, cash | [外幣匯率](https://www.kgibank.com.tw/zh-tw/personal/interest-rate/fx) | AUD, CAD, CHF, CNH, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |
| `CATHAY_BANK` | 國泰世華銀行 | html | spot, cash | [外幣匯率](https://www.cathaybk.com.tw/cathaybk/personal/product/deposit/currency-billboard/) | AUD, CAD, CHF, CNY, DKK, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, TRY, USD, ZAR |
| `MEGA_BANK` | 兆豐銀行 | api | spot, cash | [外幣匯率](https://www.megabank.com.tw/personal/savings/deposit-service/rate/foreign-rate) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, IDR, JPY, KRW, MOP, MYR, NZD, PHP, SEK, SGD, THB, USD, VND, ZAR |
| `FIRST_BANK` | 第一銀行 | html | spot, cash | [外幣匯率](https://ibank.firstbank.com.tw/NetBank/7/0201.html?sh=none) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, TRY, USD, ZAR |
| `LAND_BANK` | 土地銀行 | html | spot, cash | [外幣匯率](https://rate.landbank.com.tw/zh-TW/Foreign?mid=35) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |
| `YUANTA_BANK` | 元大銀行 | html | spot, cash | [外幣匯率](https://www.yuantabank.com.tw/bank/exchangeRate/hostccy.do) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, KRW, NZD, SEK, SGD, THB, USD, ZAR |
| `TAISHIN_BANK` | 台新銀行 | html | spot, cash | [外幣匯率](https://www.taishinbank.com.tw/TSB/personal/deposit/lookup/foreign) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |
| `TAICHUNG_BANK` | 台中銀行 | api | spot, cash | [外幣匯率](https://rate.tcbbank.com.tw/) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, USD, ZAR |
| `COOPERATIVE_BANK` | 合作金庫 | api | spot, cash | [外幣匯率](https://www.tcb-bank.com.tw/personal-banking/deposit-exchange/exchange-rate/spot) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |
| `FUBON_BANK` | 台北富邦銀行 | api | spot, cash | [外幣匯率](https://www.fubon.com/banking/personal/deposit/exchange_rate/exchange_rate_tw.htm) | AUD, CAD, CHF, CNY, EUR, GBP, HKD, JPY, NZD, SEK, SGD, THB, USD, ZAR |

## 已知限制

- 台灣銀行、將來銀行、國泰世華、第一銀行、土地銀行、台新銀行及台北富邦的請求可能需要 browser TLS fingerprint；未提供自訂 `fetch` 時套件會延遲載入 `impit`。
- 永豐銀行要合併即期與現鈔兩次請求；合作金庫要先取得驗證 token 與 cookie。
- 單一銀行維護、流量控制、TLS 或頁面改版不會讓 `fetchAllRates()` 丟棄其他銀行的成功結果。
- provider 不會自動重試。預設每次請求 timeout 為 30 秒，可由 API 或 CLI 調整。
- `fetchedAt` 是本套件開始該次抓取的時間，不是銀行自有的牌告更新時間。

## 監測

`npm run smoke` 會實際查詢全部 17 家銀行，驗證 normalized rate contract，任何 provider 失敗或回傳空資料時以非零狀態結束。GitHub Actions 的 `Live provider smoke` 每日執行並保留逐銀行 JSON artifact；它用來偵測上游改版，不取代 deterministic unit tests。

返回 [README](../README.md)。
