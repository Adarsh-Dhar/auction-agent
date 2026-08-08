/**
 * lib/seed.ts — Seeds the SQLite database with the original demo data.
 *
 * Run with: pnpm db:seed
 * This is idempotent: it checks for existing data before inserting.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const now = () => new Date().toISOString()

async function main() {
  const existingCount = await prisma.auction.count()
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} auctions — skipping seed.`)
    return
  }

  console.log("Seeding database…")

  // ── Auctions ──────────────────────────────────────────────────────────────
  await prisma.auction.createMany({
    data: [
      { id: "AUC-1048", title: "Signed first-edition design book", status: "live", bidders: 3, topBid: "$2,450", floor: "$1,800", endsAt: "2026-08-09T18:30:00.000Z", createdAt: now(), terms: "Winner pays within 48 hours. Shipping included.", channels: JSON.stringify(["Web chat", "Email"]), autoExtend: true, requiresApproval: true, joinCode: "K7P2QX" },
      { id: "AUC-1047", title: "Studio portrait commission", status: "live", bidders: 0, topBid: "$980", floor: "$750", endsAt: "2026-08-10T13:00:00.000Z", createdAt: now(), terms: "Final deliverables due within 30 days.", channels: JSON.stringify(["Web chat"]), autoExtend: false, requiresApproval: false, joinCode: "R9TZ4M" },
      { id: "AUC-1046", title: "Rare analog synthesizer", status: "draft", bidders: 0, topBid: "$0", floor: "$1,200", endsAt: "2026-08-14T20:00:00.000Z", createdAt: now(), terms: "Local pickup preferred.", channels: JSON.stringify(["Web chat", "SMS"]), autoExtend: true, requiresApproval: true, joinCode: "8HD3WY" },
      { id: "AUC-1045", title: "Custom walnut studio desk", status: "closed", bidders: 2, topBid: "$3,200", floor: "$2,000", endsAt: "2026-08-01T12:00:00.000Z", createdAt: now(), terms: "Local delivery only. Buyer assembles.", channels: JSON.stringify(["Web chat"]), autoExtend: false, requiresApproval: false, joinCode: "ZP5XKJ" },
    ],
  })

  // ── Bidders ───────────────────────────────────────────────────────────────
  await prisma.bidder.createMany({
    data: [
      { id: "bd-1", auctionId: "AUC-1048", name: "Maya Chen", handle: "maya.chen", status: "active", lastBid: "$2,450", connection: "Web chat" },
      { id: "bd-2", auctionId: "AUC-1048", name: "Jon Bell", handle: "jon.bell", status: "active", lastBid: "$2,300", connection: "Email" },
      { id: "bd-3", auctionId: "AUC-1048", name: "Rae Okafor", handle: "rae.o", status: "quiet", lastBid: "$2,050", connection: "Web chat" },
    ],
  })

  // ── Messages ──────────────────────────────────────────────────────────────
  await prisma.message.createMany({
    data: [
      { id: "m-1", bidderId: "bd-1", author: "Maya Chen", body: "I can move to $2,450 if shipping is included.", kind: "intent", at: "10:42:18" },
      { id: "m-2", bidderId: "bd-1", author: "Auction agent", body: "Shipping is included for the winning bid. Would you like to place $2,450?", kind: "system", at: "10:42:36" },
      { id: "m-3", bidderId: "bd-1", author: "Maya Chen", body: "Yes, place the bid.", kind: "bid", at: "10:42:51" },
      { id: "m-4", bidderId: "bd-1", author: "Auction agent", body: "Bid accepted. You are currently in first place.", kind: "system", at: "10:42:53" },
      { id: "m-5", bidderId: "bd-2", author: "Jon Bell", body: "Is there a certificate of authenticity?", kind: "question", at: "10:39:02" },
      { id: "m-6", bidderId: "bd-2", author: "Auction agent", body: "The seller has provided a signed provenance card.", kind: "system", at: "10:39:22" },
      { id: "m-7", bidderId: "bd-3", author: "Rae Okafor", body: "This feels outside my budget now.", kind: "risk", at: "10:34:07" },
    ],
  })

  // ── Escalations ───────────────────────────────────────────────────────────
  await prisma.escalation.createMany({
    data: [
      { id: "esc-1", auctionId: "AUC-1048", bidder: "Rae Okafor", reason: "Bidder requested a reserve exception", severity: "high", status: "open", createdAt: now() },
      { id: "esc-2", auctionId: "AUC-1047", bidder: "Jon Bell", reason: "Identity verification pending", severity: "medium", status: "open", createdAt: now() },
    ],
  })

  // ── Settlements ───────────────────────────────────────────────────────────
  await prisma.settlement.create({
    data: { id: "set-1", auctionId: "AUC-1045", winner: "Liam Torres", amount: "3.2", asset: "SOL", wallet: "7Gf...k91Q", signature: "5oT...8xL", status: "confirmed", network: "Solana mainnet", paymentRequest: "solana:7Gf...k91Q?amount=3.2", verWallet: "matched", verAmount: "matched", confirmations: 32, updatedAt: now() },
  })

  // ── Settings singleton ────────────────────────────────────────────────────
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, reserveProtection: true, autoExtend: true, humanApproval: false, webChat: true, email: true, sms: false },
    update: {},
  })

  // ── Policy rules ──────────────────────────────────────────────────────────
  await prisma.policyRule.createMany({
    data: [
      { id: "pol-1", auctionId: null, name: "Reserve floor enforcement", description: "Reject any bid that does not clear the configured floor price.", condition: "bid_amount < floor", action: "reject_bid", active: true, createdAt: now() },
      { id: "pol-2", auctionId: null, name: "Auto-extend on late bid", description: "If a bid arrives within 3 minutes of closing, extend the auction by 5 minutes.", condition: "bid_received AND time_until_close < 3m", action: "extend_5m", active: true, createdAt: now() },
      { id: "pol-3", auctionId: "AUC-1048", name: "Shipping condition", description: "Bidder can make shipping inclusion a condition of their bid.", condition: "message mentions shipping", action: "flag_for_review", active: true, createdAt: now() },
      { id: "pol-4", auctionId: null, name: "Escalate ambiguous bids", description: "When the classifier confidence is below 0.6, escalate to operator rather than acting.", condition: "classification_confidence < 0.6", action: "escalate_to_operator", active: true, createdAt: now() },
    ],
  })

  // ── Seed event log entries ────────────────────────────────────────────────
  await prisma.eventLog.createMany({
    data: [
      { id: "evt-seed-1", auctionId: "AUC-1048", type: "bid.placed", payload: JSON.stringify({ auctionId: "AUC-1048", bidderId: "bd-1", amount: "$2,450" }), at: now() },
      { id: "evt-seed-2", auctionId: "AUC-1048", type: "bid.placed", payload: JSON.stringify({ auctionId: "AUC-1048", bidderId: "bd-2", amount: "$2,300" }), at: now() },
      { id: "evt-seed-3", auctionId: "AUC-1048", type: "escalation.created", payload: JSON.stringify({ id: "esc-1", bidder: "Rae Okafor", reason: "Reserve exception" }), at: now() },
    ],
  })

  console.log("✅ Seed complete.")
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
