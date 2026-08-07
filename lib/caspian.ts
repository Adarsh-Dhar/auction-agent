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
type CaspianResource = { id: string; name: string }
export async function createCustomer(name: string) { return request<CaspianResource>("/v1/customers", { method: "POST", body: JSON.stringify({ name }) }) }
export async function createAgent(name: string) { return request<CaspianResource>("/v1/agents", { method: "POST", body: JSON.stringify({ name }) }) }
export async function connectEmail(username = "auction-agent") { const [customer, agent] = await Promise.all([createCustomer("Auction Agent Customer"), createAgent("Auction Agent")]); return request<{ id: string; channel: string; status: string; address?: string; customer_id: string; agent_id: string }>("/v1/connections/email", { method: "POST", body: JSON.stringify({ customer_id: customer.id, agent_id: agent.id, display_name: "Auction Agent", username, capabilities: ["receive", "reply", "send"] }) }) }
export async function testEmail(connectionId?: string) { return { delivered: false, connectionId, note: "Connection is active. Send a real inbound email to verify delivery." } }
export async function sendMessage(message: CaspianMessage) { return request<{ delivered: boolean; messageId?: string }>("/v1/messages", { method: "POST", body: JSON.stringify(message) }) }
export async function listenForMessages(signal?: AbortSignal) {
  if (!apiKey) throw new CaspianError("Caspian is not configured. Set CASPIAN_API_KEY to run the worker.", 503, "missing_api_key")
  const response = await fetch(`${baseUrl}/v1/messages/stream`, { headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream" }, signal, cache: "no-store" })
  if (!response.ok || !response.body) throw new CaspianError(`Caspian message stream failed (${response.status})`, response.status)
  return response.body
}
