# HTTP API and web interface

HTTP server 使用 Node.js `node:http`，不依賴 web framework。預設只綁定 `127.0.0.1:3000`，不啟用 CORS。

```sh
twrate serve --port 3000 --cache-ttl 60000 --max-concurrency 4
# 開啟 http://127.0.0.1:3000/
```

啟用 history endpoint：

```sh
twrate serve --history-file ./rates.jsonl
```

## Endpoints

### `GET /health`

只確認 process 可回應，不查詢上游銀行。

```json
{"status":"ok"}
```

### `GET /api/banks`

回傳 17 家銀行的 identifier、名稱、官方牌告網址、source kind 與 rate types。

### `GET /api/rates`

至少要有一個、最多十個 `currency`：

```sh
curl 'http://127.0.0.1:3000/api/rates?currency=USD&currency=JPY&action=buy&type=spot&top=5'
```

參數：

| 參數 | 值 | 預設 |
| --- | --- | --- |
| `currency` | 重複的三碼幣別，1–10 個 | 必填 |
| `action` | `buy`、`sell` | 無；依 spread 排序 |
| `type` | `spot`、`cash` | `spot` |
| `top` | 每個幣別 1–100 筆 | `100` |

成功回應即使有部分銀行失敗仍為 `200`：

```json
{
  "rates": [
    {
      "exchange": "ESUN_BANK",
      "fetchedAt": "2026-09-20T12:00:00.000Z",
      "source": "USD",
      "target": "TWD",
      "spotBuy": 31.5,
      "spotSell": 31.8
    }
  ],
  "failures": [{"exchange":"DBS_BANK","error":"upstream unavailable"}]
}
```

### `GET /api/history`

只有 server 設定 `--history-file` 時可用，否則回傳 `404`。支援重複的 `currency`、重複的完整 `exchange` identifier、`since`、`until` 與 `limit`；HTTP 上限為 1,000。

Invalid history query parameters return `400`. History read failures and malformed records return `500`. A configured but missing history file returns `200` with an empty `records` array.

### `GET /`

提供 dependency-free、鍵盤可操作的比較頁面。頁面顯示 loading、validation、partial failure 與 history 狀態；動態值以 DOM `textContent` 寫入，不插入未信任 HTML。

Empty rate results display an explicit no-usable-rates warning, including the provider failure count when present. Partial-success wording is used only when some rate rows remain available.

When requests overlap, only the latest rate submission or history action can update the page. Earlier requests may finish, but their responses and errors are ignored. Rate rows use the quote type captured in the request, even if the selector changes while loading.

## Programmatic server

```ts
import { startServer } from "taiwan-exchange-rates/server"

const running = await startServer({
  host: "127.0.0.1",
  port: 0,
  cacheTtlMs: 60_000,
  maxConcurrency: 4,
  historyFile: "./rates.jsonl",
})
console.log(running.url)
await running.close()
await running.closed
```

測試可把 `RateClient` 注入 `startServer({ client })`，或使用 `createRequestHandler()` 注入 history reader，避免連線至真實銀行。

## Security and deployment

- Server 是唯讀查詢介面；唯一可能的寫入來自 CLI 查詢搭配明確的 `--history-file`，HTTP request 不能指定檔案路徑。
- 回應包含 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` 與 `Cache-Control: no-store`。
- 非 `GET` method 回傳 `405`；未知 route 回傳 `404`；query 有明確數量與範圍上限。
- 若要對外網路開放，請在 reverse proxy 加入 TLS、authentication、request rate limiting、body/header limits 與 access logs。不要直接把開發用 server 暴露到 Internet。
- Process 收到 `SIGINT` 或 `SIGTERM` 時，CLI 會停止接受連線並等待 server close。

返回 [README](../README.md)，查看 [history 與 alerts](history-and-alerts.md) 或 [provider 限制](providers.md)。
