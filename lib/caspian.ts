const baseUrl = (process.env.CASPIAN_BASE_URL || "https://api.trycaspianai.com").replace(/\/$/, "")
const apiKey = process.env.CASPIAN_API_KEY

export class CaspianError extends Error {
  status: number
  code?: string
  details?: unknown
  constructor(message: string, status = 502, code?: string, details?: unknown) {
    super(message)
    this.name = "CaspianError"
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init: RequestInit = {}) {
  if (!apiKey) throw new CaspianError("Caspian is not configured. Set CASPIAN_API_KEY to enable live email.", 503, "missing_api_key")
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(init.headers || {}) }, cache: "no-store" })
  const text = await response.text()
  let body: unknown
  try { body = text ? JSON.parse(text) : undefined } catch { body = text }
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {}
    throw new CaspianError(String(record.error || record.message || `Caspian request failed (${response.status})`), response.status, typeof record.code === "string" ? record.code : undefined, body)
  }
  return body as T
}

export type CaspianChannel = { type: string; live?: boolean; connected?: boolean; status?: string; address?: string; connectionId?: string }
export type CaspianMessage = { conversationId?: string; connectionId?: string; channel?: string; from?: string; to?: string; subject?: string; body: string; messageId?: string }

export function isCaspianConfigured() { return Boolean(apiKey) }
export async function listLiveChannels() { const result = await request<{ channels?: CaspianChannel[] } | CaspianChannel[]>("/v1/channels"); return Array.isArray(result) ? result : result.channels || [] }
export async function connectEmail(username = "auction-agent") { return request<{ type: string; connected: boolean; address: string; connectionId: string }>("/v1/channels/email/connect", { method: "POST", body: JSON.stringify({ username }) }) }
export async function testEmail(connectionId?: string) { return request<{ delivered: boolean; messageId?: string }>("/v1/channels/email/test", { method: "POST", body: JSON.stringify({ connectionId }) }) }
export async function sendMessage(message: CaspianMessage) { return request<{ delivered: boolean; messageId?: string }>("/v1/messages", { method: "POST", body: JSON.stringify(message) }) }
export async function listenForMessages(signal?: AbortSignal) {
  if (!apiKey) throw new CaspianError("Caspian is not configured. Set CASPIAN_API_KEY to run the worker.", 503, "missing_api_key")
  const response = await fetch(`${baseUrl}/v1/messages/stream`, { headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream" }, signal, cache: "no-store" })
  if (!response.ok || !response.body) throw new CaspianError(`Caspian message stream failed (${response.status})`, response.status)
  return response.body
}
