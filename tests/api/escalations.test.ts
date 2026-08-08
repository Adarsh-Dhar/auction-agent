import { describe, it, expect } from "vitest"
import { GET as getEscalations, POST as postEscalation } from "@/app/api/escalations/route"
import { PATCH as patchEscalation } from "@/app/api/escalations/[id]/route"
import { createTestAuction, makeRequest, json } from "@/tests/helpers"
import { prisma } from "@/lib/db"

async function seedEscalation(overrides: Partial<{
  id: string; auctionId: string; status: string; severity: string
}> = {}) {
  return prisma.escalation.create({
    data: {
      id: overrides.id ?? "esc-test",
      auctionId: overrides.auctionId ?? "AUC-TEST",
      bidder: "Test Bidder",
      reason: "Test escalation reason",
      severity: overrides.severity ?? "medium",
      status: overrides.status ?? "open",
      createdAt: new Date().toISOString(),
    },
  })
}

describe("GET /api/escalations", () => {
  it("returns empty array when none exist", async () => {
    const res = await getEscalations()
    const data = await json<unknown[]>(res)
    expect(data).toHaveLength(0)
  })

  it("returns all escalations newest-first", async () => {
    await createTestAuction()
    await seedEscalation({ id: "esc-1" })
    await seedEscalation({ id: "esc-2" })
    const res = await getEscalations()
    const data = await json<{ id: string }[]>(res)
    expect(data).toHaveLength(2)
    expect(data.map((e) => e.id)).toContain("esc-1")
  })
})

describe("POST /api/escalations", () => {
  it("creates an escalation and returns 201", async () => {
    await createTestAuction()
    const req = makeRequest("/api/escalations", {
      method: "POST",
      body: { auctionId: "AUC-TEST", bidder: "Maya Chen", reason: "Reserve exception", severity: "high" },
    })
    const res = await postEscalation(req)
    expect(res.status).toBe(201)
    const data = await json<{ id: string; status: string }>(res)
    expect(data.id).toMatch(/^esc-/)
    expect(data.status).toBe("open")
  })

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest("/api/escalations", { method: "POST", body: { auctionId: "AUC-TEST" } })
    const res = await postEscalation(req)
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/escalations/:id", () => {
  it("resolves an open escalation", async () => {
    await createTestAuction()
    await seedEscalation()
    const req = makeRequest("/api/escalations/esc-test", { method: "PATCH", body: { status: "resolved" } })
    const res = await patchEscalation(req, { params: Promise.resolve({ id: "esc-test" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    expect(data.status).toBe("resolved")
  })

  it("reopens a resolved escalation", async () => {
    await createTestAuction()
    await seedEscalation({ status: "resolved" })
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
})
