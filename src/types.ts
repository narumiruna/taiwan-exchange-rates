export const exchanges = [
  "BANK_OF_TAIWAN",
  "DBS_BANK",
  "BANK_SINOPAC",
  "ESUN_BANK",
  "LINE_BANK",
  "HSBC_BANK",
  "NEXT_BANK",
  "KGI_BANK",
  "CATHAY_BANK",
  "MEGA_BANK",
  "FIRST_BANK",
  "LAND_BANK",
  "YUANTA_BANK",
  "TAISHIN_BANK",
  "TAICHUNG_BANK",
  "COOPERATIVE_BANK",
  "FUBON_BANK",
] as const

export type Exchange = (typeof exchanges)[number]

export type RateType = "cash" | "spot"
export type SourceKind = "api" | "html" | "text"

export type Bank = Readonly<{
  exchange: Exchange
  name: string
  nameZhTw: string
  rateTypes?: readonly RateType[]
  rateUrl?: string
  sourceKind?: SourceKind
}>

export type BankMetadata = Bank &
  Readonly<{
    rateTypes: readonly RateType[]
    rateUrl: string
    sourceKind: SourceKind
  }>

export const banks: readonly BankMetadata[] = [
  {
    exchange: "BANK_OF_TAIWAN",
    name: "Bank of Taiwan",
    nameZhTw: "台灣銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://rate.bot.com.tw/xrt?Lang=zh-TW",
    sourceKind: "text",
  },
  {
    exchange: "DBS_BANK",
    name: "DBS Bank",
    nameZhTw: "星展銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.dbs.com.tw/personal-zh/rates/foreign-exchange-rates.page",
    sourceKind: "api",
  },
  {
    exchange: "BANK_SINOPAC",
    name: "SinoPac Bank",
    nameZhTw: "永豐銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://bank.sinopac.com/MMA8/bank/html/rate/bank_ExchangeRate.html",
    sourceKind: "api",
  },
  {
    exchange: "ESUN_BANK",
    name: "E.SUN Bank",
    nameZhTw: "玉山銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates",
    sourceKind: "api",
  },
  {
    exchange: "LINE_BANK",
    name: "LINE Bank",
    nameZhTw: "LINE Bank",
    rateTypes: ["spot"],
    rateUrl: "https://www.linebank.com.tw/board-rate/exchange-rate",
    sourceKind: "html",
  },
  {
    exchange: "HSBC_BANK",
    name: "HSBC Bank",
    nameZhTw: "匯豐銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.hsbc.com.tw/currency-rates/",
    sourceKind: "html",
  },
  {
    exchange: "NEXT_BANK",
    name: "Next Bank",
    nameZhTw: "將來銀行",
    rateTypes: ["spot"],
    rateUrl: "https://www.nextbank.com.tw/rate",
    sourceKind: "api",
  },
  {
    exchange: "KGI_BANK",
    name: "KGI Bank",
    nameZhTw: "凱基銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.kgibank.com.tw/zh-tw/personal/interest-rate/fx",
    sourceKind: "html",
  },
  {
    exchange: "CATHAY_BANK",
    name: "Cathay United Bank",
    nameZhTw: "國泰世華銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.cathaybk.com.tw/cathaybk/personal/product/deposit/currency-billboard/",
    sourceKind: "html",
  },
  {
    exchange: "MEGA_BANK",
    name: "Mega International Commercial Bank",
    nameZhTw: "兆豐銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.megabank.com.tw/personal/savings/deposit-service/rate/foreign-rate",
    sourceKind: "api",
  },
  {
    exchange: "FIRST_BANK",
    name: "First Bank",
    nameZhTw: "第一銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://ibank.firstbank.com.tw/NetBank/7/0201.html?sh=none",
    sourceKind: "html",
  },
  {
    exchange: "LAND_BANK",
    name: "Land Bank of Taiwan",
    nameZhTw: "土地銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://rate.landbank.com.tw/zh-TW/Foreign?mid=35",
    sourceKind: "html",
  },
  {
    exchange: "YUANTA_BANK",
    name: "Yuanta Bank",
    nameZhTw: "元大銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.yuantabank.com.tw/bank/exchangeRate/hostccy.do",
    sourceKind: "html",
  },
  {
    exchange: "TAISHIN_BANK",
    name: "Taishin Bank",
    nameZhTw: "台新銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.taishinbank.com.tw/TSB/personal/deposit/lookup/foreign",
    sourceKind: "html",
  },
  {
    exchange: "TAICHUNG_BANK",
    name: "Taichung Bank",
    nameZhTw: "台中銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://rate.tcbbank.com.tw/",
    sourceKind: "api",
  },
  {
    exchange: "COOPERATIVE_BANK",
    name: "Taiwan Cooperative Bank",
    nameZhTw: "合作金庫",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.tcb-bank.com.tw/personal-banking/deposit-exchange/exchange-rate/spot",
    sourceKind: "api",
  },
  {
    exchange: "FUBON_BANK",
    name: "Taipei Fubon Bank",
    nameZhTw: "台北富邦銀行",
    rateTypes: ["spot", "cash"],
    rateUrl: "https://www.fubon.com/banking/personal/deposit/exchange_rate/exchange_rate_tw.htm",
    sourceKind: "api",
  },
]

export type Rate = Readonly<{
  cashBuy?: number
  cashSell?: number
  exchange: Exchange
  fetchedAt: string
  source: string
  spotBuy?: number
  spotSell?: number
  target: string
}>

export type RateFetchResponse = Pick<Response, "json" | "ok" | "status" | "text"> & {
  headers?: Headers
}

export type RateFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<RateFetchResponse>

export type FetchRatesOptions = Readonly<{
  fetch?: RateFetch
  now?: () => Date
  timeoutMs?: number
}>

export type RateFailure = Readonly<{
  error: unknown
  exchange: Exchange
}>

export type FetchAllRatesResult = Readonly<{
  failures: readonly RateFailure[]
  rates: readonly Rate[]
}>

export type FetchAllRatesOptions = FetchRatesOptions &
  Readonly<{
    exchanges?: readonly Exchange[]
    onError?: (exchange: Exchange, error: unknown) => void
  }>
