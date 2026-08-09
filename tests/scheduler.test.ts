import { describe, it, expect } from "vitest"
import {
  createTestAuction,
  createTestBidder,
  now,
} from "@/tests/helpers"
import {
  computeAuctionDeadline,
  currentCycleKey,
  hasReminderBeenSent,
  recordReminderSent,
  extendAuctionRound,
  closeAuctionByTimer,
  placeBid,
  getAuction,
  getSettlements,
  type Auction,
} from "@/lib/auction-store"

const AUC = "AUC-TIMER"

describe("bidding-round deadline computation", () => {
  it("falls back to createdAt when no bid has landed yet", async () => {
    const row = await createTestAuction({ id: AUC, bidWindowSeconds: 300 })
    const auction = (await getAuction(AUC))!
    const deadline = computeAuctionDeadline(auction)
    expect(deadline).toBe(Date.parse(row.createdAt) + 300_000)
  })

  it("anchors to lastBidAt once a bid has landed", async () => {
    await createTestAuction({ id: AUC, floor: "$100", bidWindowSeconds: 300 })
    await createTestBidder(AUC, { id: "bd-1" })
    await placeBid(AUC, "bd-1", "$150")
    const auction = (await getAuction(AUC))!
    expect(auction.lastBidAt).not.toBeNull()
    const deadline = computeAuctionDeadline(auction)
    expect(deadline).toBe(Date.parse(auction.lastBidAt!) + 300_000)
  })

  it("resets the deadline forward on every new bid", async () => {
    await createTestAuction({ id: AUC, floor: "$100", bidWindowSeconds: 300 })
    await createTestBidder(AUC, { id: "bd-1" })
    await placeBid(AUC, "bd-1", "$150")
    const firstDeadline = computeAuctionDeadline((await getAuction(AUC))!)

    await new Promise((r) => setTimeout(r, 10))
    await createTestBidder(AUC, { id: "bd-2" })
    await placeBid(AUC, "bd-2", "$200")
    const secondDeadline = computeAuctionDeadline((await getAuction(AUC))!)

    expect(secondDeadline).toBeGreaterThan(firstDeadline)
  })
})

describe("reminder dedup (ReminderSent)", () => {
  it("hasReminderBeenSent is false until recordReminderSent is called", async () => {
    await createTestAuction({ id: AUC })
    const cycleKey = "2026-01-01T00:00:00.000Z"
    expect(await hasReminderBeenSent(AUC, cycleKey, "warn-50")).toBe(false)
    await recordReminderSent(AUC, cycleKey, "warn-50")
    expect(await hasReminderBeenSent(AUC, cycleKey, "warn-50")).toBe(true)
  })

  it("is scoped per cycleKey — a new bidding round doesn't inherit old sent-tiers", async () => {
    await createTestAuction({ id: AUC })
    await recordReminderSent(AUC, "cycle-1", "warn-50")
    expect(await hasReminderBeenSent(AUC, "cycle-1", "warn-50")).toBe(true)
    expect(await hasReminderBeenSent(AUC, "cycle-2", "warn-50")).toBe(false)
  })

  it("recordReminderSent is idempotent under the unique constraint", async () => {
    await createTestAuction({ id: AUC })
    await recordReminderSent(AUC, "cycle-1", "warn-50")
    // Calling it again for the same (auctionId, cycleKey, tier) must not throw.
    await expect(recordReminderSent(AUC, "cycle-1", "warn-50")).resolves.not.toThrow()
  })
})

describe("extendAuctionRound", () => {
  it("pushes the deadline out to roughly now + extendSeconds", async () => {
    await createTestAuction({ id: AUC, bidWindowSeconds: 300, extendSeconds: 60 })
    const before = Date.now()
    const extended = await extendAuctionRound(AUC)
    expect(extended).not.toBeNull()
    const deadline = computeAuctionDeadline(extended as Auction)
    // deadline should land ~60s from "before", not ~300s
    expect(deadline).toBeGreaterThan(before + 55_000)
    expect(deadline).toBeLessThan(before + 65_000)
  })
})

describe("closeAuctionByTimer", () => {
  it("closes the auction and opens a settlement for the current leader when there was a bid", async () => {
    await createTestAuction({ id: AUC, floor: "$100" })
    await createTestBidder(AUC, { id: "bd-1", name: "Leader Bidder" })
    await placeBid(AUC, "bd-1", "$150")

    const closed = await closeAuctionByTimer(AUC)
    expect(closed?.status).toBe("closed")

    const settlements = await getSettlements()
    const forThisAuction = settlements.find((s) => s.auctionId === AUC)
    expect(forThisAuction).toBeDefined()
    expect(forThisAuction?.winner).toBe("Leader Bidder")
    expect(forThisAuction?.amount).toBe("$150.00")
  })

  it("closes with no settlement when the auction never received a bid", async () => {
    await createTestAuction({ id: AUC, floor: "$100" })
    const closed = await closeAuctionByTimer(AUC)
    expect(closed?.status).toBe("closed")
    const settlements = await getSettlements()
    expect(settlements.find((s) => s.auctionId === AUC)).toBeUndefined()
  })
})

describe("currentCycleKey", () => {
  it("changes when a bid lands, so old reminder tiers stop applying", async () => {
    await createTestAuction({ id: AUC, floor: "$100" })
    await createTestBidder(AUC, { id: "bd-1" })
    const before = currentCycleKey((await getAuction(AUC))!)
    await placeBid(AUC, "bd-1", "$150")
    const after = currentCycleKey((await getAuction(AUC))!)
    expect(after).not.toBe(before)
  })
})
