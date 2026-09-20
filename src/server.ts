import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { RateClient, RateClientOptions } from "./client.js"
import { createRateClient } from "./client.js"
import type { ReadHistoryOptions } from "./history.js"
import { HistoryQueryError, readHistory } from "./history.js"
import { queryRates } from "./query.js"
import type { Exchange } from "./types.js"
import { banks, exchanges } from "./types.js"
import { webPage, webScript } from "./web.js"

export type ServerOptions = RateClientOptions &
  Readonly<{
    client?: RateClient
    historyFile?: string
    host?: string
    port?: number
  }>

export type RequestHandlerOptions = Readonly<{
  client: RateClient
  historyFile?: string
  readHistory?: typeof readHistory
}>

export type RunningServer = Readonly<{
  close: () => Promise<void>
  closed: Promise<void>
  url: string
}>

export function createRequestHandler(options: RequestHandlerOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      await handleRequest(request, response, options)
    } catch (error) {
      sendJson(response, 500, { error: errorMessage(error) })
    }
  }
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 3000
  validateHostAndPort(host, port)
  const client =
    options.client ??
    createRateClient({
      cacheTtlMs: options.cacheTtlMs,
      fetch: options.fetch,
      maxConcurrency: options.maxConcurrency,
      minStartIntervalMs: options.minStartIntervalMs,
      now: options.now,
      timeoutMs: options.timeoutMs,
    })
  const server = createServer(createRequestHandler({ client, historyFile: options.historyFile }))
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once("error", onError)
    server.listen(port, host, () => {
      server.off("error", onError)
      resolve()
    })
  })
  const closed = new Promise<void>((resolve, reject) => {
    server.once("close", resolve)
    server.on("error", (error) => {
      reject(error)
      if (server.listening) server.close()
    })
  })
  const address = server.address() as AddressInfo
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address
  let closePromise: Promise<void> | undefined
  const close = () => {
    closePromise ??= new Promise<void>((resolve, reject) => {
      if (!server.listening) return resolve()
      server.close((error) => (error ? reject(error) : resolve()))
    })
    return closePromise
  }
  return {
    close,
    closed,
    url: `http://${displayHost}:${address.port}`,
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: RequestHandlerOptions,
): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    sendJson(response, 405, { error: "Method not allowed" })
    return
  }
  const url = new URL(request.url ?? "/", "http://localhost")
  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" })
    return
  }
  if (url.pathname === "/api/banks") {
    sendJson(response, 200, { banks })
    return
  }
  if (url.pathname === "/api/rates") {
    await handleRates(url, response, options.client)
    return
  }
  if (url.pathname === "/api/history") {
    await handleHistory(url, response, options)
    return
  }
  if (url.pathname === "/") {
    sendText(response, 200, webPage, "text/html; charset=utf-8")
    return
  }
  if (url.pathname === "/app.js") {
    sendText(response, 200, webScript, "text/javascript; charset=utf-8")
    return
  }
  sendJson(response, 404, { error: "Not found" })
}

async function handleRates(url: URL, response: ServerResponse, client: RateClient): Promise<void> {
  const currencies = url.searchParams.getAll("currency").map((value) => value.toUpperCase())
  if (
    currencies.length < 1 ||
    currencies.length > 10 ||
    currencies.some((item) => !/^[A-Z]{3}$/.test(item))
  ) {
    sendJson(response, 400, { error: "Provide 1 to 10 three-letter currency parameters" })
    return
  }
  const action = choice(url.searchParams.get("action"), ["buy", "sell"] as const, "action")
  const rateType = choice(url.searchParams.get("type") ?? "spot", ["spot", "cash"] as const, "type")
  const top = boundedInteger(url.searchParams.get("top") ?? "100", "top", 1, 100)
  if (action instanceof Error || rateType instanceof Error || top instanceof Error) {
    sendJson(response, 400, { error: errorMessage(firstError(action, rateType, top)) })
    return
  }
  const result = await client.fetchAllRatesDetailed()
  const rates = queryRates(result.rates, {
    action,
    currencies,
    rateType,
    sort: action ? "price" : "spread",
    top,
  })
  sendJson(response, 200, {
    failures: result.failures.map((failure) => ({
      error: errorMessage(failure.error),
      exchange: failure.exchange,
    })),
    rates,
  })
}

async function handleHistory(
  url: URL,
  response: ServerResponse,
  options: RequestHandlerOptions,
): Promise<void> {
  if (!options.historyFile) {
    sendJson(response, 404, { error: "History is not configured" })
    return
  }
  const currencies = url.searchParams.getAll("currency").map((value) => value.toUpperCase())
  if (currencies.some((item) => !/^[A-Z]{3}$/.test(item))) {
    sendJson(response, 400, { error: "Currency must be a three-letter code" })
    return
  }
  const exchangeValues = url.searchParams.getAll("exchange")
  if (exchangeValues.some((value) => !(exchanges as readonly string[]).includes(value))) {
    sendJson(response, 400, { error: "Unsupported exchange" })
    return
  }
  const limit = boundedInteger(url.searchParams.get("limit") ?? "100", "limit", 1, 1000)
  if (limit instanceof Error) {
    sendJson(response, 400, { error: limit.message })
    return
  }
  const readOptions: ReadHistoryOptions = {
    currencies: currencies.length ? currencies : undefined,
    exchanges: exchangeValues.length ? (exchangeValues as Exchange[]) : undefined,
    limit,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
  }
  try {
    const records = await (options.readHistory ?? readHistory)(options.historyFile, readOptions)
    sendJson(response, 200, { records })
  } catch (error) {
    if (!(error instanceof HistoryQueryError)) throw error
    sendJson(response, 400, { error: errorMessage(error) })
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  sendText(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8")
}

function sendText(
  response: ServerResponse,
  status: number,
  body: string,
  contentType: string,
): void {
  if (response.headersSent) return
  response.writeHead(status, securityHeaders(contentType))
  response.end(body)
}

function securityHeaders(contentType: string): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  }
}

function choice<const T extends readonly string[]>(
  value: string | null,
  choices: T,
  name: string,
): T[number] | undefined | Error {
  if (value === null) return undefined
  if (!(choices as readonly string[]).includes(value)) {
    return new Error(`${name} must be one of: ${choices.join(", ")}`)
  }
  return value as T[number]
}

function boundedInteger(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
): number | Error {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
}

function firstError(...values: unknown[]): Error {
  return values.find((value): value is Error => value instanceof Error) as Error
}

function validateHostAndPort(host: string, port: number): void {
  if (!host.trim()) throw new RangeError("host must not be empty")
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("port must be an integer from 0 to 65535")
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
