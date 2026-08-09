#!/usr/bin/env tsx
/**
 * scripts/scheduler.ts — the orchestration layer that didn't exist before.
 *
 * Next.js API routes here only run on request; nothing in this stack runs on
 * its own. This is a standalone, always-on Node process — same shape as
 * email-service/handler.py (run via `pnpm run email-service`) — that polls
 * live auctions on an interval and drives the per-bid round timer:
 *
 *   - reminds every active bidder as the deadline for the next bid
 *     approaches, always including the current top bid + top bidder, so the
 *     pressure is competitive rather than just "you personally are behind"
 *   - grants one grace extension if autoExtend is on and the deadline is hit
 *     with no new bid
 *   - closes the auction (and opens a settlement for the leader) if the
 *     deadline is hit a second time with still no bid
 *
 * Run alongside `next start`/`next dev` and the email service:
 *   pnpm run scheduler
 *
 * Poll interval and reminder tiers are intentionally simple constants for a
 * first pass — see the plan note about moving tiers into the existing
 * PolicyRule table once this is verified end-to-end.
 */
import {
  getLiveAuctionsForTimer,
  getBiddersForAuction,
  getAuctionLeader,
  computeAuctionDeadline,
  currentCycleKey,
  hasReminderBeenSent,
  recordReminderSent,
  extendAuctionRound,
  closeAuctionByTimer,
  addAgentMessage,
  type Auction,
  type Bidder,
} from "../lib/auction-store"

const POLL_INTERVAL_MS = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5000)
// Fraction of bidWindowSeconds elapsed at which each tier fires. Ordered
// ascending so the loop below can pick the highest tier already crossed.
const REMINDER_TIERS: { tier: string; atFraction: number; label: (secsLeft: number) => string }[] = [
  { tier: "warn-50", atFraction: 0.5, label: (s) => `⏰ ${s}s left to bid on "{title}" — current high bid is {topBid} by {topBidder}.` },
  { tier: "warn-80", atFraction: 0.8, label: (s) => `⏰ Only ${s}s left on "{title}"! Current high bid is {topBid} by {topBidder}. Bid now to stay in it.` },
  { tier: "final-call", atFraction: 0.95, label: (s) => `🔔 Final call — ${s}s left on "{title}". Current high bid is {topBid} by {topBidder}.` },
]

// Local webhook the email service exposes (see email-service/handler.py
// handle_notify_resolved for the existing precedent of this fire-and-forget
// pattern). Best-effort: the scheduler must never crash or stall because the
// email service happens to be down.
const EMAIL_WEBHOOK_URL = `http://127.0.0.1:${process.env.EMAIL_WEBHOOK_PORT ?? "3001"}/notify-reminder` 

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "")
}

async function notifyBidder(bidder: Bidder, body: string) {
  // In-app: lands in the dashboard drawer + SSE, same path every other
  // agent message uses.
  await addAgentMessage(bidder.id, body, "system", "Auction agent").catch(() => {})

  // Email: fire-and-forget POST to the email service's local webhook, same
  // pattern app/api/escalations/[id]/route.ts already uses for
  // notify-resolved. Best-effort — never throws into the scheduler loop.
  if (bidder.email && bidder.connection === "Email") {
    fetch(EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidderId: bidder.id, note: body }),
    }).catch(() => {})
  }
}

async function processAuction(auction: Auction) {
  const deadline = computeAuctionDeadline(auction)
  const windowMs = auction.bidWindowSeconds * 1000
  const elapsedMs = windowMs - (deadline - Date.now())
  const fraction = windowMs > 0 ? elapsedMs / windowMs : 1
  const cycleKey = currentCycleKey(auction)
  const secsLeft = Math.max(0, Math.round((deadline - Date.now()) / 1000))

  const bidders = await getBiddersForAuction(auction.id)
  const activeBidders = bidders.filter((b) => b.status !== "dropped")
  if (activeBidders.length === 0) return // nothing to remind, nothing to time out meaningfully

  const leader = await getAuctionLeader(auction.id)
  const vars = {
    title: auction.title,
    topBid: auction.topBid,
    topBidder: leader?.handle ?? "no one yet",
  }

  // Deadline has actually passed — handle extend/close before reminders,
  // since there's no point reminding people the round is about to end when
  // it already has.
  if (fraction >= 1) {
    const extended = await hasReminderBeenSent(auction.id, cycleKey, "extended")
    if (auction.autoExtend && !extended) {
      await recordReminderSent(auction.id, cycleKey, "extended")
      await extendAuctionRound(auction.id)
      const body = fillTemplate(
        `🔔 No bids came in for "{title}" — extending by ${auction.extendSeconds}s. Current high bid is {topBid} by {topBidder}. Last chance to beat it.`,
        vars
      )
      await Promise.all(activeBidders.map((b) => notifyBidder(b, body)))
      console.log(`[scheduler] ${auction.id} extended by ${auction.extendSeconds}s (no bid at deadline)`)
      return
    }

    // Either autoExtend is off, or the one grace extension was already used
    // this cycle and the (extended) deadline has now also passed.
    await closeAuctionByTimer(auction.id)
    const body = fillTemplate(`🔒 "{title}" has closed. Final high bid: {topBid} by {topBidder}.`, vars)
    await Promise.all(activeBidders.map((b) => notifyBidder(b, body)))
    console.log(`[scheduler] ${auction.id} closed by timer, winner=${leader?.handle ?? "none"} amount=${auction.topBid}`)
    return
  }

  // Walk tiers highest-to-lowest so a scheduler that was down for a bit and
  // wakes up past two tiers only sends the most urgent one, not a backlog.
  for (let i = REMINDER_TIERS.length - 1; i >= 0; i--) {
    const t = REMINDER_TIERS[i]
    if (fraction < t.atFraction) continue
    const already = await hasReminderBeenSent(auction.id, cycleKey, t.tier)
    if (already) break // this and every lower tier for this cycle are already sent
    await recordReminderSent(auction.id, cycleKey, t.tier)
    const body = fillTemplate(t.label(secsLeft), vars)
    await Promise.all(activeBidders.map((b) => notifyBidder(b, body)))
    console.log(`[scheduler] ${auction.id} sent tier=${t.tier} secsLeft=${secsLeft} top=${auction.topBid}`)
    break
  }
}

async function tick() {
  let auctions: Auction[] = []
  try {
    auctions = await getLiveAuctionsForTimer()
  } catch (e) {
    console.error("[scheduler] failed to load live auctions:", e)
    return
  }
  for (const auction of auctions) {
    try {
      await processAuction(auction)
    } catch (e) {
      // One auction's failure must never take down the loop for the rest.
      console.error(`[scheduler] error processing ${auction.id}:`, e)
    }
  }
}

async function main() {
  console.log(`[scheduler] starting, poll interval ${POLL_INTERVAL_MS}ms`)
  // Run once immediately, then on the interval — don't wait a full interval
  // before the first check after a restart.
  await tick()
  setInterval(tick, POLL_INTERVAL_MS)
}

main().catch((e) => {
  console.error("[scheduler] fatal:", e)
  process.exit(1)
})
