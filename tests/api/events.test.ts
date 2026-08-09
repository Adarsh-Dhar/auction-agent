import { describe, it, expect } from "vitest"
import { GET as getEvents } from "@/app/api/events/route"
import { makeRequest, json, createTestAuction } from "@/tests/helpers"
import { prisma } from "@/lib/db"

// Monotonic counter mirroring lib/auction-store.ts's nextEventId() — a
// random suffix here would reintroduce the exact tie-ordering bug this
// file used to hit intermittently when events landed in the same
// millisecond (very possible with fast, back-to-back SQLite writes).
let _testEventSeq = 0
function nextTestEventId(): string {
  _testEventSeq += 1
  return `evt-${Date.now()}-${_testEventSeq.toString(36).padStart(6, "0")}`
}

async function seedEvent(type: string, auctionId: string | null = null) {
  return prisma.eventLog.create({
    data: {
      id: nextTestEventId(),
      type,
      payload: JSON.stringify({ test: true }),
      at: new Date().toISOString(),
      auctionId,
    },
  })
}

describe("GET /api/events", () => {
  it("returns empty array initially", async () => {
    const res = await getEvents(makeRequest("/api/events"))
    const data = await json<unknown[]>(res)
    expect(data).toHaveLength(0)
  })

  it("returns all events newest-first", async () => {
    await seedEvent("bid.placed", "AUC-TEST")
    await seedEvent("escalation.created", "AUC-TEST")
    await seedEvent("settings.updated", null)
    const res = await getEvents(makeRequest("/api/events"))
    const data = await json<{ type: string }[]>(res)
    expect(data).toHaveLength(3)
    // newest-first — last inserted should appear first
    // With monotonic event IDs, this ordering is now deterministic
    expect(data[0].type).toBe("settings.updated")
    expect(data[1].type).toBe("escalation.created")
    expect(data[2].type).toBe("bid.placed")
  })

  it("filters by auctionId when query param is provided", async () => {
    await createTestAuction({ id: "AUC-A", joinCode: "AAAAAA" })
    await createTestAuction({ id: "AUC-B", joinCode: "BBBBBB" })
    await seedEvent("bid.placed", "AUC-A")
    await seedEvent("bid.placed", "AUC-B")
    await seedEvent("bid.placed", "AUC-A")

    const res = await getEvents(makeRequest("/api/events?auctionId=AUC-A"))
    const data = await json<{ auctionId: string }[]>(res)
    expect(data).toHaveLength(2)
    expect(data.every((e) => e.auctionId === "AUC-A")).toBe(true)
  })

  it("is populated by emit() calls when mutations happen", async () => {
    const auction = await createTestAuction({ id: "AUC-TEST", joinCode: "EVTTST" })
    const { createTestBidder } = await import("@/tests/helpers")
    const bidder = await createTestBidder(auction.id, { id: "bd-evt-1", name: "Test Bidder" })
    // Trigger a real mutation that calls emit() → logEvent()
    const { createEscalation } = await import("@/lib/auction-store")
    await createEscalation({ auctionId: auction.id, bidderId: bidder.id, bidderName: bidder.name, reason: "Test reason", severity: "low" })

    // Wait briefly for the fire-and-forget logEvent to complete
    await new Promise((r) => setTimeout(r, 100))

    const res = await getEvents(makeRequest("/api/events"))
    const data = await json<{ type: string }[]>(res)
    expect(data.some((e) => e.type === "escalation.created")).toBe(true)
  })
})
