/**
 * auction-store.ts — Prisma-backed data layer
 *
 * All public function signatures are async and mirror the previous in-memory
 * API exactly, so existing call sites only need an `await` added.
 *
 * The EventEmitter is kept for SSE — it doesn't need to be persisted.
 * Every mutation calls emit() AND logEvent() so the EventLog table grows in
 * step with real activity.
 */
import { EventEmitter } from "node:events"
import { prisma } from "@/lib/db"
import type {
  Auction as PrismaAuction,
  Bidder as PrismaBidder,
  Message as PrismaMessage,
  Escalation as PrismaEscalation,
  Settlement as PrismaSettlement,
  Settings as PrismaSettings,
} from "@prisma/client"

// ─── Re-exported types ────────────────────────────────────────────────────────

export type AuctionStatus = "live" | "draft" | "closed" | "paused"
export type MessageKind = "intent" | "question" | "bid" | "system" | "risk"

export type Auction = {
  id: string
  title: string
  status: AuctionStatus
  bidders: number
  topBid: string
  floor: string
  endsAt: string | null
  minIncrement: string
  createdAt: string
  terms: string
  channels: string[]
  autoExtend: boolean
  requiresApproval: boolean
  joinCode: string
}

export type Bidder = {
  id: string
  name: string
  handle: string
  status: "active" | "quiet" | "dropped"
  lastBid: string
  connection: string
  email?: string
}

export type Message = {
  id: string
  bidderId: string
  author: string
  body: string
  kind: MessageKind
  at: string
}

export type Escalation = {
  id: string
  auctionId: string
  /** Real FK to Bidder.id */
  bidderId: string
  /** Denormalised display name — copy of Bidder.name at creation time */
  bidderName: string
  reason: string
  severity: "high" | "medium" | "low"
  status: "open" | "resolved"
  createdAt: string
}

export type Settlement = {
  id: string
  auctionId: string
  winner: string
  amount: string
  asset: "SOL" | "USDC"
  wallet: string
  signature: string
  status: "pending" | "verifying" | "confirmed" | "failed"
  network: "Solana mainnet" | "Solana devnet"
  paymentRequest: string
  verification: {
    wallet: "pending" | "matched" | "mismatch"
    amount: "pending" | "matched" | "mismatch"
    confirmations: number
  }
  updatedAt: string
}

// ─── SSE event bus ────────────────────────────────────────────────────────────

const _events = new EventEmitter()
_events.setMaxListeners(100)

const now = () => new Date().toISOString()

// Monotonic per-process counter for EventLog IDs. `at` is only
// millisecond-precision, so two events created in the same millisecond
// (easily possible — a single request can fire multiple emit() calls, and
// SQLite writes are fast) would otherwise be indistinguishable in sort
// order. Embedding a strictly-increasing, zero-padded sequence in the ID
// means id-string comparison always matches true creation order, so it can
// serve as a reliable tiebreaker (see getEventLog's orderBy below) without
// a schema migration.
let _eventSeq = 0
function nextEventId(): string {
  _eventSeq += 1
  return `evt-${Date.now()}-${_eventSeq.toString(36).padStart(6, "0")}`
}

export const auctionStore = {
  /** The EventEmitter used by the SSE stream route. */
  events: _events,
}

export function emit(type: string, payload: unknown) {
  _events.emit("auction", { type, payload, at: now() })
  // Persist asynchronously — fire-and-forget, never blocks the response
  logEvent(type, payload).catch(() => {})
}

export async function logEvent(type: string, payload: unknown, auctionId?: string) {
  await prisma.eventLog.create({
    data: {
      id: nextEventId(),
      type,
      payload: JSON.stringify(payload),
      at: now(),
      auctionId: auctionId ?? extractAuctionId(payload),
    },
  })
}

function extractAuctionId(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (typeof p.auctionId === "string") return p.auctionId
    if (typeof p.id === "string" && p.id.startsWith("AUC-")) return p.id
  }
  return null
}

// ─── Shape converters (Prisma row → domain type) ──────────────────────────────

function toAuction(row: PrismaAuction): Auction {
  let channels: string[]
  try {
    channels = JSON.parse(row.channels)
  } catch {
    channels = row.channels ? row.channels.split(",").map((s) => s.trim()) : ["Web chat"]
  }
  return {
    id: row.id,
    title: row.title,
    status: row.status as AuctionStatus,
    bidders: row.bidders,
    topBid: row.topBid,
    floor: row.floor,
    endsAt: row.endsAt,
    minIncrement: row.minIncrement,
    createdAt: row.createdAt,
    terms: row.terms,
    channels,
    autoExtend: row.autoExtend,
    requiresApproval: row.requiresApproval,
    joinCode: row.joinCode,
  }
}

function toBidder(row: PrismaBidder): Bidder {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    status: row.status as Bidder["status"],
    lastBid: row.lastBid,
    connection: row.connection,
    email: row.email ?? undefined,
  }
}

function toMessage(row: PrismaMessage): Message {
  return {
    id: row.id,
    bidderId: row.bidderId,
    author: row.author,
    body: row.body,
    kind: row.kind as MessageKind,
    at: row.at,
  }
}

function toEscalation(row: PrismaEscalation): Escalation {
  return {
    id: row.id,
    auctionId: row.auctionId,
    bidderId: row.bidderId,
    bidderName: row.bidderName,
    reason: row.reason,
    severity: row.severity as Escalation["severity"],
    status: row.status as Escalation["status"],
    createdAt: row.createdAt,
  }
}

function toSettlement(row: PrismaSettlement): Settlement {
  return {
    id: row.id,
    auctionId: row.auctionId,
    winner: row.winner,
    amount: row.amount,
    asset: row.asset as Settlement["asset"],
    wallet: row.wallet,
    signature: row.signature,
    status: row.status as Settlement["status"],
    network: row.network as Settlement["network"],
    paymentRequest: row.paymentRequest,
    verification: {
      wallet: row.verWallet as Settlement["verification"]["wallet"],
      amount: row.verAmount as Settlement["verification"]["amount"],
      confirmations: row.confirmations,
    },
    updatedAt: row.updatedAt,
  }
}

// ─── Join code helpers ────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generateJoinCode(length = 6): string {
  let code = ""
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return code
}

async function generateUniqueJoinCode(): Promise<string> {
  let code = generateJoinCode()
  while (await prisma.auction.findUnique({ where: { joinCode: code } })) {
    code = generateJoinCode()
  }
  return code
}

// ─── Currency helpers ─────────────────────────────────────────────────────────

export function parseCurrency(value: string): number {
  if (!value) return NaN
  const cleaned = value.replace(/[^0-9.]/g, "")
  return cleaned ? Number.parseFloat(cleaned) : NaN
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function calculateDefaultMinIncrement(floor: string): string {
  if (!floor) return "$1"
  const isNegative = floor.trim().startsWith("-")
  const floorValue = parseCurrency(floor)
  if (Number.isNaN(floorValue) || floorValue <= 0 || isNegative) {
    return "$1" // Fallback to safe default for invalid/zero/negative floors
  }
  const increment = roundCurrency(floorValue * 0.01)
  return formatCurrency(increment)
}

// ─── Auction queries ──────────────────────────────────────────────────────────

export async function getAuctions(): Promise<Auction[]> {
  const rows = await prisma.auction.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map(toAuction)
}

export async function getAuction(id: string): Promise<Auction | null> {
  const row = await prisma.auction.findUnique({ where: { id } })
  return row ? toAuction(row) : null
}

export async function createAuction(
  input: Omit<Auction, "id" | "createdAt" | "bidders" | "topBid" | "joinCode"> & { minIncrement?: string; endsAt?: string | null }
): Promise<Auction> {
  // Generate a sequential-style ID based on current count
  const count = await prisma.auction.count()
  const id = `AUC-${1049 + count}`
  const joinCode = await generateUniqueJoinCode()

  const row = await prisma.auction.create({
    data: {
      id,
      title: input.title,
      status: input.status,
      floor: input.floor,
      endsAt: input.endsAt ?? null,
      minIncrement: input.minIncrement ?? calculateDefaultMinIncrement(input.floor),
      createdAt: now(),
      terms: input.terms,
      channels: JSON.stringify(input.channels),
      autoExtend: input.autoExtend,
      requiresApproval: input.requiresApproval,
      joinCode,
      bidders: 0,
      topBid: "$0",
    },
  })

  const auction = toAuction(row)
  emit("auction.created", auction)
  return auction
}

export async function rotateJoinCode(auctionId: string): Promise<Auction | null> {
  const joinCode = await generateUniqueJoinCode()
  try {
    const row = await prisma.auction.update({ where: { id: auctionId }, data: { joinCode } })
    const auction = toAuction(row)
    emit("auction.codeRotated", auction)
    return auction
  } catch {
    return null
  }
}

// ─── Bidder queries ───────────────────────────────────────────────────────────

export async function getBiddersForAuction(auctionId: string): Promise<Bidder[]> {
  const rows = await prisma.bidder.findMany({ where: { auctionId } })
  return rows.map(toBidder)
}

export async function findBidderById(bidderId: string): Promise<Bidder | null> {
  const row = await prisma.bidder.findUnique({ where: { id: bidderId } })
  return row ? toBidder(row) : null
}

export async function findBidderByEmail(email: string): Promise<{ auction: Auction; bidder: Bidder } | null> {
  const normalized = email.trim().toLowerCase()
  // SQLite is case-insensitive for ASCII by default, so a simple equals works.
  // For full Unicode safety we do a JS-level toLowerCase comparison after fetching candidates.
  const rows = await prisma.bidder.findMany({
    where: { email: { not: null } },
    include: { auction: true },
  })
  const row = rows.find((r) => r.email?.toLowerCase() === normalized)
  if (!row) return null
  return { auction: toAuction(row.auction), bidder: toBidder(row) }
}

// ─── Join flow ────────────────────────────────────────────────────────────────

export function parseJoinCommand(message: string): string | null {
  const match = message.trim().match(/^\/?join\s+([a-z0-9]{4,8})$/i)
  return match ? match[1].toUpperCase() : null
}

export type JoinResult =
  | { ok: true; auction: Auction; bidder: Bidder }
  | { ok: false; reason: "invalid_code" | "auction_closed" }

export async function joinAuctionByCode(
  code: string,
  applicant: { name: string; handle: string; connection: string; email?: string }
): Promise<JoinResult> {
  const normalized = code.trim().toUpperCase()
  const auctionRow = await prisma.auction.findUnique({ where: { joinCode: normalized } })
  if (!auctionRow) return { ok: false, reason: "invalid_code" }
  if (auctionRow.status === "closed") return { ok: false, reason: "auction_closed" }

  // Idempotent re-join
  const existingRows = await prisma.bidder.findMany({ where: { auctionId: auctionRow.id } })
  const existing = existingRows.find((b) => b.handle.toLowerCase() === applicant.handle.toLowerCase())
  if (existing) return { ok: true, auction: toAuction(auctionRow), bidder: toBidder(existing) }

  const bidder = await prisma.bidder.create({
    data: {
      id: `bd-${Date.now().toString(36)}`,
      auctionId: auctionRow.id,
      name: applicant.name,
      handle: applicant.handle,
      status: "active",
      lastBid: "—",
      connection: applicant.connection,
      email: applicant.email,
    },
  })

  // Increment bidder count
  const updatedAuction = await prisma.auction.update({
    where: { id: auctionRow.id },
    data: { bidders: { increment: 1 } },
  })

  const auction = toAuction(updatedAuction)
  emit("bidder.joined", { auctionId: auction.id, bidder: toBidder(bidder) })
  return { ok: true, auction, bidder: toBidder(bidder) }
}

// ─── Bid flow ─────────────────────────────────────────────────────────────────

export type BidResult =
  | { ok: true; auction: Auction; bidder: Bidder; outbid: Bidder | null }
  | { ok: false; reason: "not_found" | "auction_closed" | "invalid_amount" | "below_floor" | "below_top_bid" | "below_min_increment"; detail?: { floor?: string; topBid?: string; minIncrement?: string; minRequired?: string } }

export async function placeBid(auctionId: string, bidderId: string, rawAmount: string): Promise<BidResult> {
  const auctionRow = await prisma.auction.findUnique({ where: { id: auctionId } })
  if (!auctionRow) return { ok: false, reason: "not_found" }
  if (auctionRow.status === "closed") return { ok: false, reason: "auction_closed" }

  // Lazy time-based auto-close check (skip if endsAt is null = unlimited auction)
  if (auctionRow.endsAt) {
    const endTime = Date.parse(auctionRow.endsAt)
    if (!Number.isNaN(endTime) && Date.now() >= endTime) {
      // Auto-close the auction
      await prisma.auction.update({ where: { id: auctionId }, data: { status: "closed" } })
      return { ok: false, reason: "auction_closed" }
    }
  }

  const bidderRow = await prisma.bidder.findFirst({ where: { id: bidderId, auctionId } })
  if (!bidderRow) return { ok: false, reason: "not_found" }

  const amount = roundCurrency(parseCurrency(rawAmount))
  if (Number.isNaN(amount)) return { ok: false, reason: "invalid_amount" }

  const floor = parseCurrency(auctionRow.floor)
  const topBid = parseCurrency(auctionRow.topBid)
  const minIncrement = parseCurrency(auctionRow.minIncrement)

  if (!Number.isNaN(floor) && amount < floor) {
    return { ok: false, reason: "below_floor", detail: { floor: auctionRow.floor } }
  }

  // Increment-aware bid validation
  if (!Number.isNaN(topBid) && topBid > 0) {
    const minRequired = roundCurrency(topBid + minIncrement)
    console.log(`DEBUG VALIDATION: topBid=${topBid}, minIncrement=${minIncrement}, minRequired=${minRequired}, amount=${amount}`)
    if (amount <= topBid) {
      console.log(`DEBUG REJECT: amount <= topBid`)
      return { 
        ok: false, 
        reason: "below_top_bid", 
        detail: { topBid: auctionRow.topBid, minIncrement: auctionRow.minIncrement, minRequired: formatCurrency(minRequired) } 
      }
    }
    if (amount < minRequired) {
      console.log(`DEBUG REJECT: amount < minRequired`)
      return { 
        ok: false, 
        reason: "below_min_increment", 
        detail: { topBid: auctionRow.topBid, minIncrement: auctionRow.minIncrement, minRequired: formatCurrency(minRequired) } 
      }
    }
    console.log(`DEBUG ACCEPT: amount >= minRequired`)
  }

  // Find the outbid leader (different bidder who had the previous top bid)
  let outbid: Bidder | null = null
  if (!Number.isNaN(topBid) && topBid > 0) {
    const topBidFormatted = formatCurrency(topBid)
    const outbidRow = await prisma.bidder.findFirst({
      where: { auctionId, id: { not: bidderId }, lastBid: topBidFormatted },
    })
    if (outbidRow) outbid = toBidder(outbidRow)
  }

  const formatted = formatCurrency(amount)
  const [updatedBidder, updatedAuction] = await prisma.$transaction([
    prisma.bidder.update({ where: { id: bidderId }, data: { lastBid: formatted, status: "active" } }),
    prisma.auction.update({ where: { id: auctionId }, data: { topBid: formatted } }),
  ])

  const auction = toAuction(updatedAuction)
  const bidder = toBidder(updatedBidder)

  emit("bid.placed", { auctionId, bidderId: bidder.id, amount: bidder.lastBid })
  return { ok: true, auction, bidder, outbid }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(bidderId: string): Promise<Message[]> {
  const rows = await prisma.message.findMany({ where: { bidderId }, orderBy: [{ at: "asc" }, { id: "asc" }] })
  return rows.map(toMessage)
}

export async function addMessage(bidderId: string, body: string, kind: MessageKind = "system"): Promise<Message> {
  const row = await prisma.message.create({
    data: {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      bidderId,
      author: "Operator",
      body,
      kind,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    },
  })
  const message = toMessage(row)
  emit("message.created", message)
  return message
}

export async function addAgentMessage(
  bidderId: string,
  body: string,
  kind: MessageKind = "system",
  author = "Auction agent"
): Promise<Message> {
  const row = await prisma.message.create({
    data: {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      bidderId,
      author,
      body,
      kind,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    },
  })
  const message = toMessage(row)
  emit("message.created", message)
  return message
}

// ─── Escalations ──────────────────────────────────────────────────────────────

export async function getEscalations(): Promise<Escalation[]> {
  const rows = await prisma.escalation.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map(toEscalation)
}

export async function createEscalation(
  input: Omit<Escalation, "id" | "createdAt" | "status">
): Promise<Escalation> {
  const row = await prisma.escalation.create({
    data: {
      id: `esc-${Date.now().toString(36)}`,
      auctionId: input.auctionId,
      bidderId: input.bidderId,
      bidderName: input.bidderName,
      reason: input.reason,
      severity: input.severity,
      status: "open",
      createdAt: now(),
    },
  })
  const escalation = toEscalation(row)
  emit("escalation.created", escalation)
  return escalation
}

export async function resolveEscalation(id: string, note?: string): Promise<Escalation | null> {
  try {
    const row = await prisma.escalation.update({ where: { id }, data: { status: "resolved" } })
    const escalation = toEscalation(row)
    emit("escalation.resolved", escalation)

    // Write the resolution note to the bidder's message thread so it appears
    // in the dashboard drawer and fires message.created over SSE.
    if (note?.trim() && escalation.bidderId) {
      await addAgentMessage(escalation.bidderId, note.trim(), "system", "Auction agent")
    }

    return escalation
  } catch {
    return null
  }
}

export async function reopenEscalation(id: string): Promise<Escalation | null> {
  try {
    const row = await prisma.escalation.update({ where: { id }, data: { status: "open" } })
    const escalation = toEscalation(row)
    emit("escalation.reopened", escalation)
    return escalation
  } catch {
    return null
  }
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export async function getSettlements(): Promise<Settlement[]> {
  const rows = await prisma.settlement.findMany({ orderBy: { updatedAt: "desc" } })
  return rows.map(toSettlement)
}

export async function getSettlement(id: string): Promise<Settlement | null> {
  const row = await prisma.settlement.findUnique({ where: { id } })
  return row ? toSettlement(row) : null
}

export async function createSettlement(
  input: Pick<Settlement, "winner" | "amount" | "asset" | "wallet" | "auctionId">
): Promise<Settlement> {
  const row = await prisma.settlement.create({
    data: {
      id: `set-${Date.now()}`,
      auctionId: input.auctionId,
      winner: input.winner,
      amount: input.amount,
      asset: input.asset,
      wallet: input.wallet,
      signature: "awaiting-wallet-signature",
      status: "pending",
      network: "Solana devnet",
      paymentRequest: `solana:${input.wallet}?amount=${input.amount}&label=Auction%20settlement`,
      verWallet: "pending",
      verAmount: "pending",
      confirmations: 0,
      updatedAt: now(),
    },
  })
  const settlement = toSettlement(row)
  emit("settlement.created", settlement)
  return settlement
}

export async function updateSettlement(id: string, status: Settlement["status"]): Promise<Settlement | null> {
  try {
    let extraData: Record<string, unknown> = {}
    if (status === "verifying") extraData = { verWallet: "matched", verAmount: "matched", confirmations: 1 }
    if (status === "confirmed") extraData = { signature: `sim-${Date.now().toString(36)}`, network: "Solana mainnet", verWallet: "matched", verAmount: "matched", confirmations: 32 }
    if (status === "failed") extraData = { verWallet: "mismatch", verAmount: "pending", confirmations: 0 }

    const row = await prisma.settlement.update({
      where: { id },
      data: { status, updatedAt: now(), ...extraData },
    })
    const settlement = toSettlement(row)
    emit(`settlement.${status}`, settlement)
    return settlement
  } catch {
    return null
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<PrismaSettings> {
  // Upsert the singleton row so it always exists
  return prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, reserveProtection: true, autoExtend: true, humanApproval: false, webChat: true, email: true, sms: false },
    update: {},
  })
}

export async function updateSettings(patch: Partial<Omit<PrismaSettings, "id">>): Promise<PrismaSettings> {
  const updated = await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, reserveProtection: true, autoExtend: true, humanApproval: false, webChat: true, email: true, sms: false, ...patch },
    update: patch,
  })
  emit("settings.updated", updated)
  return updated
}

// ─── Policy rules ─────────────────────────────────────────────────────────────

export async function getPolicyRules(auctionId?: string) {
  return prisma.policyRule.findMany({
    where: { active: true, ...(auctionId ? { OR: [{ auctionId }, { auctionId: null }] } : {}) },
    orderBy: { createdAt: "asc" },
  })
}

export async function createPolicyRule(input: {
  auctionId?: string
  name: string
  description?: string
  condition: string
  action: string
}) {
  const row = await prisma.policyRule.create({
    data: {
      id: `pol-${Date.now().toString(36)}`,
      auctionId: input.auctionId ?? null,
      name: input.name,
      description: input.description ?? "",
      condition: input.condition,
      action: input.action,
      active: true,
      createdAt: now(),
    },
  })
  emit("policy.created", row)
  return row
}

export async function updatePolicyRule(id: string, patch: { name?: string; description?: string; condition?: string; action?: string; active?: boolean }) {
  try {
    const row = await prisma.policyRule.update({ where: { id }, data: patch })
    emit("policy.updated", row)
    return row
  } catch {
    return null
  }
}

export async function deletePolicyRule(id: string) {
  try {
    const row = await prisma.policyRule.update({ where: { id }, data: { active: false } })
    emit("policy.deleted", row)
    return row
  } catch {
    return null
  }
}

// ─── Event log ────────────────────────────────────────────────────────────────

export async function getEventLog(auctionId?: string) {
  return prisma.eventLog.findMany({
    where: auctionId ? { auctionId } : undefined,
    // `at` alone isn't a reliable sort key — two events created in the
    // same millisecond would tie. `id` embeds a monotonic per-process
    // sequence (see nextEventId()), so it's a safe deterministic
    // tiebreaker that always matches true creation order.
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 200,
  })
}
