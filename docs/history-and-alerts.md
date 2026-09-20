# History and alerts

## JSON Lines history

只有明確傳入 `--history-file` 時 CLI 才會寫檔，不會建立隱藏的全域資料。每完成一次查詢，就 append 一行 versioned JSON：

```json
{"version":1,"recordedAt":"2026-09-20T12:00:00.000Z","exchanges":["BANK_OF_TAIWAN"],"requestedCurrencies":["USD"],"rates":[{"exchange":"BANK_OF_TAIWAN","fetchedAt":"2026-09-20T12:00:00.000Z","source":"USD","target":"TWD","spotBuy":31,"spotSell":32}]}
```

```sh
# 查詢並保存 snapshot
twrate USD JPY --history-file ./rates.jsonl

# 讀取最近 20 筆 USD snapshot
twrate history USD --history-file ./rates.jsonl --limit 20

# 依銀行與時間範圍篩選
twrate history USD --bank bot --since 2026-09-01T00:00:00Z --until 2026-09-30T23:59:59Z \
  --history-file ./rates.jsonl --format json
```

Node.js API 由獨立 subpath 提供，root import 不會載入 `node:fs`：

```ts
import {
  appendHistory,
  createHistoryRecord,
  readHistory,
} from "taiwan-exchange-rates/history"

const record = createHistoryRecord(rates, {
  exchanges: ["BANK_OF_TAIWAN"],
  requestedCurrencies: ["USD"],
})
await appendHistory("./rates.jsonl", record)
const recent = await readHistory("./rates.jsonl", {
  currencies: ["USD"],
  limit: 100,
})
```

Reader 保留檔案順序並回傳最後 `limit` 筆；預設 100、上限 10,000。不存在的檔案回傳空陣列。格式損壞時會回報行號，不會靜默略過。

Default history tables keep each snapshot separate under `Recorded at: <recordedAt>`, in file order. This is the snapshot recording time, not a bank update time or the rate's `fetchedAt`. JSON retains the complete records; CSV retains normalized rate rows with `fetchedAt`.

JSONL 是 append-only，可能持續增長。請依執行頻率使用 `logrotate`、定期封存或刪除舊檔。schema 目前是 version 1；升級 reader 時必須保留 version 1 相容性。修改或搬移資料前先備份檔案。

## Threshold alerts

動作採顧客角度：

- `buy` 使用最低銀行賣出價，搭配 `--at-or-below`。
- `sell` 使用最高銀行買進價，搭配 `--at-or-above`。

```sh
twrate alert USD --action buy --type spot --at-or-below 31.5
twrate alert JPY --action sell --type cash --at-or-above 0.22 --format json
```

Exit code：

| Code | 意義 |
| --- | --- |
| `0` | 門檻已觸發 |
| `1` | 有效查詢但未達門檻，或沒有可執行牌價 |
| `2` | CLI 參數無效 |

可用 exit code 接 cron、systemd timer 或外部通知服務：

```sh
if twrate alert USD --action buy --at-or-below 31.5 --format json > alert.json; then
  send-notification < alert.json
fi
```

套件不直接寄 email、LINE 或 push，也不保存通知憑證。程式內可使用 root export `evaluateAlert(rates, options)` 取得 typed result。

返回 [README](../README.md)，或查看 [HTTP API](http-api.md) 如何提供 history。
