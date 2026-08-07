import { EventEmitter } from "node:events"

export type AuctionStatus = "live" | "draft" | "closed" | "paused"
export type MessageKind = "intent" | "question" | "bid" | "system" | "risk"

export type Auction = {
  id: string
  title: string
  status: AuctionStatus
  bidders: number
  topBid: string
  floor: string
  endsAt: string
  createdAt: string
  terms: string
  channels: string[]
  autoExtend: boolean
  requiresApproval: boolean
}

export type Bidder = { id: string; name: string; handle: string; status: "active" | "quiet" | "dropped"; lastBid: string; connection: string }
export type Message = { id: string; bidderId: string; author: string; body: string; kind: MessageKind; at: string }
export type Escalation = { id: string; auctionId: string; bidder: string; reason: string; severity: "high" | "medium" | "low"; status: "open" | "resolved"; createdAt: string }
export type Settlement = { id: string; auctionId: string; winner: string; amount: string; asset: "SOL" | "USDC"; wallet: string; signature: string; status: "pending" | "verifying" | "confirmed" | "failed"; network: "Solana mainnet" | "Solana devnet"; paymentRequest: string; verification: { wallet: "pending" | "matched" | "mismatch"; amount: "pending" | "matched" | "mismatch"; confirmations: number }; updatedAt: string }

const now = () => new Date().toISOString()
const events = new EventEmitter()
const auctions: Auction[] = [
  { id: "AUC-1048", title: "Signed first-edition design book", status: "live", bidders: 7, topBid: "$2,450", floor: "$1,800", endsAt: "2026-08-09T18:30:00.000Z", createdAt: now(), terms: "Winner pays within 48 hours. Shipping included.", channels: ["Web chat", "Email"], autoExtend: true, requiresApproval: true },
  { id: "AUC-1047", title: "Studio portrait commission", status: "live", bidders: 4, topBid: "$980", floor: "$750", endsAt: "2026-08-10T13:00:00.000Z", createdAt: now(), terms: "Final deliverables due within 30 days.", channels: ["Web chat"], autoExtend: false, requiresApproval: false },
  { id: "AUC-1046", title: "Rare analog synthesizer", status: "draft", bidders: 0, topBid: "$0", floor: "$1,200", endsAt: "2026-08-14T20:00:00.000Z", createdAt: now(), terms: "Local pickup preferred.", channels: ["Web chat", "SMS"], autoExtend: true, requiresApproval: true },
]
const bidders: Record<string, Bidder[]> = { "AUC-1048": [
  { id: "bd-1", name: "Maya Chen", handle: "maya.chen", status: "active", lastBid: "$2,450", connection: "Web chat" },
  { id: "bd-2", name: "Jon Bell", handle: "jon.bell", status: "active", lastBid: "$2,300", connection: "Email" },
  { id: "bd-3", name: "Rae Okafor", handle: "rae.o", status: "quiet", lastBid: "$2,050", connection: "Web chat" },
], "AUC-1047": [] }
const messages: Record<string, Message[]> = { "bd-1": [
  { id: "m-1", bidderId: "bd-1", author: "Maya Chen", body: "I can move to $2,450 if shipping is included.", kind: "intent", at: "10:42:18" },
  { id: "m-2", bidderId: "bd-1", author: "Auction agent", body: "Shipping is included for the winning bid. Would you like to place $2,450?", kind: "system", at: "10:42:36" },
  { id: "m-3", bidderId: "bd-1", author: "Maya Chen", body: "Yes, place the bid.", kind: "bid", at: "10:42:51" },
  { id: "m-4", bidderId: "bd-1", author: "Auction agent", body: "Bid accepted. You are currently in first place.", kind: "system", at: "10:42:53" },
], "bd-2": [{ id: "m-5", bidderId: "bd-2", author: "Jon Bell", body: "Is there a certificate of authenticity?", kind: "question", at: "10:39:02" }, { id: "m-6", bidderId: "bd-2", author: "Auction agent", body: "The seller has provided a signed provenance card.", kind: "system", at: "10:39:22" }], "bd-3": [{ id: "m-7", bidderId: "bd-3", author: "Rae Okafor", body: "This feels outside my budget now.", kind: "risk", at: "10:34:07" }] }
const escalations: Escalation[] = [{ id: "esc-1", auctionId: "AUC-1048", bidder: "Rae Okafor", reason: "Bidder requested a reserve exception", severity: "high", status: "open", createdAt: now() }, { id: "esc-2", auctionId: "AUC-1047", bidder: "Jon Bell", reason: "Identity verification pending", severity: "medium", status: "open", createdAt: now() }]
const settlements: Settlement[] = [{ id: "set-1", auctionId: "AUC-1045", winner: "Liam Torres", amount: "3.2", asset: "SOL", wallet: "7Gf...k91Q", signature: "5oT...8xL", status: "confirmed", network: "Solana mainnet", paymentRequest: "solana:7Gf...k91Q?amount=3.2", verification: { wallet: "matched", amount: "matched", confirmations: 32 }, updatedAt: now() }]
const settings = { reserveProtection: true, autoExtend: true, humanApproval: false, webChat: true, email: true, sms: false }

export const auctionStore = { auctions, bidders, messages, escalations, settlements, settings, events }
export function emit(type: string, payload: unknown) { events.emit("auction", { type, payload, at: now() }) }
export function createAuction(input: Omit<Auction, "id" | "createdAt" | "bidders" | "topBid">) { const auction: Auction = { ...input, id: `AUC-${1049 + auctions.length}`, createdAt: now(), bidders: 0, topBid: "$0" }; auctions.unshift(auction); emit("auction.created", auction); return auction }
export function resolveEscalation(id: string) { const item = escalations.find((entry) => entry.id === id); if (item) { item.status = "resolved"; emit("escalation.resolved", item) }; return item }
export function addMessage(bidderId: string, body: string) { const message: Message = { id: `m-${Date.now()}`, bidderId, author: "Operator", body, kind: "system", at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }; messages[bidderId] = [...(messages[bidderId] || []), message]; emit("message.created", message); return message }
export function createSettlement(input: Pick<Settlement, "winner" | "amount" | "asset" | "wallet" | "auctionId">) { const settlement: Settlement = { ...input, id: `set-${Date.now()}`, signature: "awaiting-wallet-signature", status: "pending", network: "Solana devnet", paymentRequest: `solana:${input.wallet}?amount=${input.amount}&label=Auction%20settlement`, verification: { wallet: "pending", amount: "pending", confirmations: 0 }, updatedAt: now() }; settlements.unshift(settlement); emit("settlement.created", settlement); return settlement }
export function updateSettlement(id: string, status: Settlement["status"]) { const item = settlements.find((entry) => entry.id === id); if (item) { item.status = status; item.updatedAt = now(); if (status === "verifying") item.verification = { wallet: "matched", amount: "matched", confirmations: 1 }; if (status === "confirmed") { item.signature = `sim-${Date.now().toString(36)}`; item.network = "Solana mainnet"; item.verification = { wallet: "matched", amount: "matched", confirmations: 32 } }; if (status === "failed") item.verification = { wallet: "mismatch", amount: "pending", confirmations: 0 }; emit(`settlement.${status}`, item) }; return item }
export function getSettlement(id: string) { return settlements.find((entry) => entry.id === id) }
export function reopenEscalation(id: string) { const item = escalations.find((entry) => entry.id === id); if (item) { item.status = "open"; emit("escalation.reopened", item) }; return item }
