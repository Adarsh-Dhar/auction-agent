import { describe, it, expect } from "vitest"
import { GET as getAuctions, POST as postAuction } from "@/app/api/auctions/route"
import { GET as getAuction, PATCH as patchAuction } from "@/app/api/auctions/[auctionId]/route"
import { createTestAuction, makeRequest, json } from "@/tests/helpers"

describe("GET /api/auctions", () => {
  it("returns an empty array when no auctions exist", async () => {
    const res = await getAuctions()
    const data = await json<unknown[]>(res)
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it("returns seeded auctions", async () => {
    await createTestAuction({ id: "AUC-001", title: "Book", joinCode: "BK0001" })
    await createTestAuction({ id: "AUC-002", title: "Desk", joinCode: "DK0002" })
    const res = await getAuctions()
    const data = await json<{ id: string }[]>(res)
    expect(data).toHaveLength(2)
    expect(data.map((a) => a.id)).toContain("AUC-001")
  })
})

describe("POST /api/auctions", () => {
  it("creates an auction and returns 201", async () => {
    const req = makeRequest("/api/auctions", {
      method: "POST",
      body: {
        title: "Rare vinyl",
        floor: "$200",
        status: "draft",
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        terms: "No returns.",
        channels: ["Web chat"],
        autoExtend: false,
        requiresApproval: false,
      },
    })
    const res = await postAuction(req)
    expect(res.status).toBe(201)
    const data = await json<{ id: string; joinCode: string }>(res)
    expect(data.id).toMatch(/^AUC-/)
    expect(data.joinCode).toHaveLength(6)
  })

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest("/api/auctions", { method: "POST", body: { title: "Incomplete" } })
    const res = await postAuction(req)
    expect(res.status).toBe(400)
  })
})

describe("GET /api/auctions/:auctionId", () => {
  it("returns auction + bidders", async () => {
    await createTestAuction({ id: "AUC-DETAIL", joinCode: "DTLXXX" })
    const req = makeRequest("/api/auctions/AUC-DETAIL")
    const res = await getAuction(req, { params: Promise.resolve({ auctionId: "AUC-DETAIL" }) })
    expect(res.status).toBe(200)
    const data = await json<{ auction: { id: string }; bidders: unknown[] }>(res)
    expect(data.auction.id).toBe("AUC-DETAIL")
    expect(Array.isArray(data.bidders)).toBe(true)
  })

  it("returns 404 for unknown auction", async () => {
    const req = makeRequest("/api/auctions/NOPE")
    const res = await getAuction(req, { params: Promise.resolve({ auctionId: "NOPE" }) })
    expect(res.status).toBe(404)
  })
})

describe("PATCH /api/auctions/:auctionId (rotateCode)", () => {
  it("rotates the join code and returns updated auction", async () => {
    await createTestAuction({ id: "AUC-ROTATE", joinCode: "ROTXXX" })
    const req = makeRequest("/api/auctions/AUC-ROTATE", { method: "PATCH", body: { action: "rotateCode" } })
    const res = await patchAuction(req, { params: Promise.resolve({ auctionId: "AUC-ROTATE" }) })
    expect(res.status).toBe(200)
    const data = await json<{ auction: { joinCode: string } }>(res)
    expect(data.auction.joinCode).not.toBe("ROTXXX")
    expect(data.auction.joinCode).toHaveLength(6)
  })

  it("returns 400 for unknown action", async () => {
    await createTestAuction({ id: "AUC-BADACT", joinCode: "BADACT" })
    const req = makeRequest("/api/auctions/AUC-BADACT", { method: "PATCH", body: { action: "unknown" } })
    const res = await patchAuction(req, { params: Promise.resolve({ auctionId: "AUC-BADACT" }) })
    expect(res.status).toBe(400)
  })
})
