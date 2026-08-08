import { describe, it, expect } from "vitest"
import { GET as getEscalations, POST as postEscalation } from "@/app/api/escalations/route"
import { PATCH as patchEscalation } from "@/app/api/escalations/[id]/route"
import { createTestAuction, createTestBidder, makeRequest, json } from "@/tests/helpers"
import { prisma } from "@/lib/db"

// ─── Fixtures ────────────────────────────────────────────────────────────────

async function seedEscalation(
  bidderId: string,
  overrides: Partial<{
    id: string
    auctionId: string
    status: string
    severity: string
  }> = {}
) {
  const bidderRow = await prisma.bidder.findUnique({ where: { id: bidderId } })
  return prisma.escalation.create({
    data: {
      id: overrides.id ?? "esc-test",
      auctionId: overrides.auctionId ?? bidderRow!.auctionId,
      bidderId,
      bidderName: bidderRow!.name,
      reason: "Test escalation reason",
      severity: overrides.severity ?? "medium",
      status: overrides.status ?? "open",
      createdAt: new Date().toISOString(),
    },
  })
}

// ─── GET /api/escalations ─────────────────────────────────────────────────────

describe("GET /api/escalations", () => {
  it("returns empty array when none exist", async () => {
    const res = await getEscalations()
    const data = await json<unknown[]>(res)
    expect(data).toHaveLength(0)
  })

  it("returns all escalations newest-first", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-esc-get-1" })
    await seedEscalation(bidder.id, { id: "esc-1" })
    await seedEscalation(bidder.id, { id: "esc-2" })
    const res = await getEscalations()
    const data = await json<{ id: string }[]>(res)
    expect(data).toHaveLength(2)
    expect(data.map((e) => e.id)).toContain("esc-1")
  })
})

// ─── POST /api/escalations ────────────────────────────────────────────────────

describe("POST /api/escalations", () => {
  it("creates an escalation with bidderId and returns 201", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-post-1", name: "Maya Chen" })
    const req = makeRequest("/api/escalations", {
      method: "POST",
      body: { auctionId: auction.id, bidderId: bidder.id, reason: "Reserve exception", severity: "high" },
    })
    const res = await postEscalation(req)
    expect(res.status).toBe(201)
    const data = await json<{ id: string; status: string; bidderId: string; bidderName: string }>(res)
    expect(data.id).toMatch(/^esc-/)
    expect(data.status).toBe("open")
    expect(data.bidderId).toBe(bidder.id)
    expect(data.bidderName).toBe("Maya Chen")
  })

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest("/api/escalations", { method: "POST", body: { auctionId: "AUC-X" } })
    const res = await postEscalation(req)
    expect(res.status).toBe(400)
  })

  it("returns 404 when bidderId does not exist", async () => {
    const auction = await createTestAuction()
    const req = makeRequest("/api/escalations", {
      method: "POST",
      body: { auctionId: auction.id, bidderId: "bd-ghost", reason: "Ghost bidder" },
    })
    const res = await postEscalation(req)
    expect(res.status).toBe(404)
  })
})

// ─── PATCH /api/escalations/:id ───────────────────────────────────────────────

describe("PATCH /api/escalations/:id", () => {
  it("resolves an open escalation", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-resolve-1" })
    await seedEscalation(bidder.id)
    const req = makeRequest("/api/escalations/esc-test", { method: "PATCH", body: { status: "resolved" } })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    expect(data.status).toBe("resolved")
  })

  it("reopens a resolved escalation", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-reopen-1" })
    await seedEscalation(bidder.id, { status: "resolved" })
    const req = makeRequest("/api/escalations/esc-test", { method: "PATCH", body: { status: "open" } })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    expect(data.status).toBe("open")
  })

  it("returns 404 for unknown escalation", async () => {
    const req = makeRequest("/api/escalations/nope", { method: "PATCH", body: { status: "resolved" } })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "nope" }) })
    expect(res.status).toBe(404)
  })

  // ── Resolution note → Message row ─────────────────────────────────────────

  it("creates a Message row when resolved with a note", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-note-1" })
    await seedEscalation(bidder.id)

    const req = makeRequest("/api/escalations/esc-test", {
      method: "PATCH",
      body: { status: "resolved", note: "Approved — conditional bid accepted." },
    })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)

    // A Message row must exist for this bidder with the exact note text
    const messages = await prisma.message.findMany({ where: { bidderId: bidder.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe("Approved — conditional bid accepted.")
    expect(messages[0].author).toBe("Auction agent")
    expect(messages[0].bidderId).toBe(bidder.id)
  })

  it("creates no Message row when resolved without a note", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-nonote-1" })
    await seedEscalation(bidder.id)

    const req = makeRequest("/api/escalations/esc-test", {
      method: "PATCH",
      body: { status: "resolved" },  // no note field
    })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)

    const count = await prisma.message.count({ where: { bidderId: bidder.id } })
    expect(count).toBe(0)
  })

  it("creates no Message row when note is blank whitespace", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-blankote-1" })
    await seedEscalation(bidder.id)

    const req = makeRequest("/api/escalations/esc-test", {
      method: "PATCH",
      body: { status: "resolved", note: "   " },
    })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)

    const count = await prisma.message.count({ where: { bidderId: bidder.id } })
    expect(count).toBe(0)
  })

  it("creates no Message row when reopening (note ignored on reopen)", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-reopen-note-1" })
    await seedEscalation(bidder.id, { status: "resolved" })

    const req = makeRequest("/api/escalations/esc-test", {
      method: "PATCH",
      body: { status: "open", note: "This note must not be sent on reopen." },
    })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)

    const count = await prisma.message.count({ where: { bidderId: bidder.id } })
    expect(count).toBe(0)
  })

  it("response includes bidderId and bidderName", async () => {
    const auction = await createTestAuction()
    const bidder = await createTestBidder(auction.id, { id: "bd-fields-1", name: "Jon Bell" })
    await seedEscalation(bidder.id)

    const req = makeRequest("/api/escalations/esc-test", {
      method: "PATCH",
      body: { status: "resolved" },
    })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    const data = await json<{ bidderId: string; bidderName: string }>(res)
    expect(data.bidderId).toBe(bidder.id)
    expect(data.bidderName).toBe("Jon Bell")
  })
})
