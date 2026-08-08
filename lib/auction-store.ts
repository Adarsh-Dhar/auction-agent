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
  joinCode: string
}

export type Bidder = { id: string; name: string; handle: string; status: "active" | "quiet" | "dropped"; lastBid: string; connection: string; email?: string }
export type Message = { id: string; bidderId: string; author: string; body: string; kind: MessageKind; at: string }
export type Escalation = { id: string; auctionId: string; bidder: string; reason: string; severity: "high" | "medium" | "low"; status: "open" | "resolved"; createdAt: string }
export type Settlement = { id: string; auctionId: string; winner: string; amount: string; asset: "SOL" | "USDC"; wallet: string; signature: string; status: "pending" | "verifying" | "confirmed" | "failed"; network: "Solana mainnet" | "Solana devnet"; paymentRequest: string; verification: { wallet: "pending" | "matched" | "mismatch"; amount: "pending" | "matched" | "mismatch"; confirmations: number }; updatedAt: string }

const now = () => new Date().toISOString()
const events = new EventEmitter()

// Room-code style join codes (like Ludo King): short, unambiguous, easy to read aloud.
// Excludes visually-confusable characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
function generateJoinCode(length = 6): string {
  let code = ""
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return code
}
function generateUniqueJoinCode(): string {
  let code = generateJoinCode()
  while (auctions.some((auction) => auction.joinCode === code)) code = generateJoinCode()
  return code
}

// Currency values are stored as display strings (e.g. "$2,450"); these convert
// to/from numbers so bids can be compared against the floor and current top bid.
function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "")
  return cleaned ? Number.parseFloat(cleaned) : NaN
}
function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

const auctions: Auction[] = [
  { id: "AUC-1048", title: "Signed first-edition design book", status: "live", bidders: 7, topBid: "$2,450", floor: "$1,800", endsAt: "2026-08-09T18:30:00.000Z", createdAt: now(), terms: "Winner pays within 48 hours. Shipping included.", channels: ["Web chat", "Email"], autoExtend: true, requiresApproval: true, joinCode: "K7P2QX" },
  { id: "AUC-1047", title: "Studio portrait commission", status: "live", bidders: 4, topBid: "$980", floor: "$750", endsAt: "2026-08-10T13:00:00.000Z", createdAt: now(), terms: "Final deliverables due within 30 days.", channels: ["Web chat"], autoExtend: false, requiresApproval: false, joinCode: "R9TZ4M" },
  { id: "AUC-1046", title: "Rare analog synthesizer", status: "draft", bidders: 0, topBid: "$0", floor: "$1,200", endsAt: "2026-08-14T20:00:00.000Z", createdAt: now(), terms: "Local pickup preferred.", channels: ["Web chat", "SMS"], autoExtend: true, requiresApproval: true, joinCode: "8HD3WY" },
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
export function createAuction(input: Omit<Auction, "id" | "createdAt" | "bidders" | "topBid" | "joinCode">) { const auction: Auction = { ...input, id: `AUC-${1049 + auctions.length}`, createdAt: now(), bidders: 0, topBid: "$0", joinCode: generateUniqueJoinCode() }; auctions.unshift(auction); bidders[auction.id] = []; emit("auction.created", auction); return auction }

// Regenerates the join code for an auction, e.g. if the seller thinks it leaked.
export function rotateJoinCode(auctionId: string) { const auction = auctions.find((entry) => entry.id === auctionId); if (auction) { auction.joinCode = generateUniqueJoinCode(); emit("auction.codeRotated", auction) }; return auction }

// Parses a chat-style join command, e.g. "/join K7P2QX" or "join k7p2qx".
// Returns the extracted code (uppercased) or null if the message isn't a join command.
export function parseJoinCommand(message: string): string | null {
  const match = message.trim().match(/^\/?join\s+([a-z0-9]{4,8})$/i)
  return match ? match[1].toUpperCase() : null
}

export type JoinResult =
  | { ok: true; auction: Auction; bidder: Bidder }
  | { ok: false; reason: "invalid_code" | "auction_closed" }

// A bidder joins an auction by presenting the room code the seller shared with them.
// This is the gate that stops anyone who doesn't have the code from being added.
export function joinAuctionByCode(code: string, applicant: { name: string; handle: string; connection: string; email?: string }): JoinResult {
  const normalized = code.trim().toUpperCase()
  const auction = auctions.find((entry) => entry.joinCode === normalized)
  if (!auction) return { ok: false, reason: "invalid_code" }
  if (auction.status === "closed") return { ok: false, reason: "auction_closed" }
  const roster = bidders[auction.id] || (bidders[auction.id] = [])
  const existing = roster.find((entry) => entry.handle.toLowerCase() === applicant.handle.toLowerCase())
  if (existing) return { ok: true, auction, bidder: existing }
  const bidder: Bidder = { id: `bd-${Date.now().toString(36)}`, name: applicant.name, handle: applicant.handle, status: "active", lastBid: "—", connection: applicant.connection, email: applicant.email }
  roster.push(bidder)
  auction.bidders = roster.length
  emit("bidder.joined", { auctionId: auction.id, bidder })
  return { ok: true, auction, bidder }
}

// Looks up which auction (if any) an email address has already joined, keyed by
// the email stored on the bidder record. Used by the email channel to route a
// reply to "bid"/"status"/question intents without asking for the code again.
export function findBidderByEmail(email: string): { auction: Auction; bidder: Bidder } | null {
  const normalized = email.trim().toLowerCase()
  for (const auction of auctions) {
    const roster = bidders[auction.id] || []
    const match = roster.find((entry) => entry.email && entry.email.toLowerCase() === normalized)
    if (match) return { auction, bidder: match }
  }
  return null
}

export type BidResult =
  | { ok: true; auction: Auction; bidder: Bidder; outbid: Bidder | null }
  | { ok: false; reason: "not_found" | "auction_closed" | "invalid_amount" | "below_floor" | "below_top_bid" }

// Places a bid for a bidder already on the roster. Rejects amounts that don't
// clear the reserve floor or the current top bid, and reports whoever previously
// held the top bid (if they're a different bidder) so they can be notified.
export function placeBid(auctionId: string, bidderId: string, rawAmount: string): BidResult {
  const auction = auctions.find((entry) => entry.id === auctionId)
  if (!auction) return { ok: false, reason: "not_found" }
  if (auction.status === "closed") return { ok: false, reason: "auction_closed" }
  const roster = bidders[auctionId] || []
  const bidder = roster.find((entry) => entry.id === bidderId)
  if (!bidder) return { ok: false, reason: "not_found" }

  const amount = parseCurrency(rawAmount)
  if (Number.isNaN(amount)) return { ok: false, reason: "invalid_amount" }

  const floor = parseCurrency(auction.floor)
  const topBid = parseCurrency(auction.topBid)
  if (!Number.isNaN(floor) && amount < floor) return { ok: false, reason: "below_floor" }
  if (!Number.isNaN(topBid) && amount <= topBid) return { ok: false, reason: "below_top_bid" }

  const previousLeader = roster.find((entry) => entry.id !== bidderId && parseCurrency(entry.lastBid) === topBid) || null

  bidder.lastBid = formatCurrency(amount)
  bidder.status = "active"
  auction.topBid = formatCurrency(amount)
  emit("bid.placed", { auctionId, bidderId: bidder.id, amount: bidder.lastBid })

  return { ok: true, auction, bidder, outbid: previousLeader }
}
export function resolveEscalation(id: string) { const item = escalations.find((entry) => entry.id === id); if (item) { item.status = "resolved"; emit("escalation.resolved", item) }; return item }
export function addMessage(bidderId: string, body: string) { const message: Message = { id: `m-${Date.now()}`, bidderId, author: "Operator", body, kind: "system", at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }; messages[bidderId] = [...(messages[bidderId] || []), message]; emit("message.created", message); return message }
export function createSettlement(input: Pick<Settlement, "winner" | "amount" | "asset" | "wallet" | "auctionId">) { const settlement: Settlement = { ...input, id: `set-${Date.now()}`, signature: "awaiting-wallet-signature", status: "pending", network: "Solana devnet", paymentRequest: `solana:${input.wallet}?amount=${input.amount}&label=Auction%20settlement`, verification: { wallet: "pending", amount: "pending", confirmations: 0 }, updatedAt: now() }; settlements.unshift(settlement); emit("settlement.created", settlement); return settlement }
export function updateSettlement(id: string, status: Settlement["status"]) { const item = settlements.find((entry) => entry.id === id); if (item) { item.status = status; item.updatedAt = now(); if (status === "verifying") item.verification = { wallet: "matched", amount: "matched", confirmations: 1 }; if (status === "confirmed") { item.signature = `sim-${Date.now().toString(36)}`; item.network = "Solana mainnet"; item.verification = { wallet: "matched", amount: "matched", confirmations: 32 } }; if (status === "failed") item.verification = { wallet: "mismatch", amount: "pending", confirmations: 0 }; emit(`settlement.${status}`, item) }; return item }
export function getSettlement(id: string) { return settlements.find((entry) => entry.id === id) }
export function reopenEscalation(id: string) { const item = escalations.find((entry) => entry.id === id); if (item) { item.status = "open"; emit("escalation.reopened", item) }; return item }
