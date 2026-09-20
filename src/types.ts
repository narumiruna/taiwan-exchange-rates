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

export type Bank = Readonly<{
  exchange: Exchange
  name: string
  nameZhTw: string
}>

export const banks: readonly Bank[] = [
  { exchange: "BANK_OF_TAIWAN", name: "Bank of Taiwan", nameZhTw: "台灣銀行" },
  { exchange: "DBS_BANK", name: "DBS Bank", nameZhTw: "星展銀行" },
  { exchange: "BANK_SINOPAC", name: "SinoPac Bank", nameZhTw: "永豐銀行" },
  { exchange: "ESUN_BANK", name: "E.SUN Bank", nameZhTw: "玉山銀行" },
  { exchange: "LINE_BANK", name: "LINE Bank", nameZhTw: "LINE Bank" },
  { exchange: "HSBC_BANK", name: "HSBC Bank", nameZhTw: "匯豐銀行" },
  { exchange: "NEXT_BANK", name: "Next Bank", nameZhTw: "將來銀行" },
  { exchange: "KGI_BANK", name: "KGI Bank", nameZhTw: "凱基銀行" },
  { exchange: "CATHAY_BANK", name: "Cathay United Bank", nameZhTw: "國泰世華銀行" },
  { exchange: "MEGA_BANK", name: "Mega International Commercial Bank", nameZhTw: "兆豐銀行" },
  { exchange: "FIRST_BANK", name: "First Bank", nameZhTw: "第一銀行" },
  { exchange: "LAND_BANK", name: "Land Bank of Taiwan", nameZhTw: "土地銀行" },
  { exchange: "YUANTA_BANK", name: "Yuanta Bank", nameZhTw: "元大銀行" },
  { exchange: "TAISHIN_BANK", name: "Taishin Bank", nameZhTw: "台新銀行" },
  { exchange: "TAICHUNG_BANK", name: "Taichung Bank", nameZhTw: "台中銀行" },
  { exchange: "COOPERATIVE_BANK", name: "Taiwan Cooperative Bank", nameZhTw: "合作金庫" },
  { exchange: "FUBON_BANK", name: "Taipei Fubon Bank", nameZhTw: "台北富邦銀行" },
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

export type FetchAllRatesOptions = FetchRatesOptions &
  Readonly<{
    exchanges?: readonly Exchange[]
    onError?: (exchange: Exchange, error: unknown) => void
  }>
