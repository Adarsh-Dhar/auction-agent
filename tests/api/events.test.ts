import { describe, it, expect } from "vitest"
import { GET as getEvents } from "@/app/api/events/route"
import { makeRequest, json, createTestAuction } from "@/tests/helpers"
import { prisma } from "@/lib/db"

async function seedEvent(type: string, auctionId: string | null = null) {
  return prisma.eventLog.create({
    data: {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    expect(data[0].type).toBe("settings.updated")
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
    await createTestAuction()
    // Trigger a real mutation that calls emit() → logEvent()
    const { createEscalation } = await import("@/lib/auction-store")
    await createEscalation({ auctionId: "AUC-TEST", bidder: "Test", reason: "Test reason", severity: "low" })

    // Wait briefly for the fire-and-forget logEvent to complete
    await new Promise((r) => setTimeout(r, 100))

    const res = await getEvents(makeRequest("/api/events"))
    const data = await json<{ type: string }[]>(res)
    expect(data.some((e) => e.type === "escalation.created")).toBe(true)
  })
})
