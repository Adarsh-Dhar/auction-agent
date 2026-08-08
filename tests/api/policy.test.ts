import { describe, it, expect } from "vitest"
import { GET as getPolicy, POST as postPolicy, PATCH as patchPolicy, DELETE as deletePolicy } from "@/app/api/policy/route"
import { createTestAuction, makeRequest, json } from "@/tests/helpers"

describe("GET /api/policy", () => {
  it("returns empty array initially", async () => {
    const res = await getPolicy(makeRequest("/api/policy"))
    const data = await json<unknown[]>(res)
    expect(data).toHaveLength(0)
  })

  it("returns only active rules", async () => {
    // Create one active and one inactive rule directly
    const { prisma } = await import("@/lib/db")
    const now = new Date().toISOString()
    await prisma.policyRule.createMany({
      data: [
        { id: "pol-active", name: "Active rule", condition: "x > 0", action: "accept", active: true, createdAt: now },
        { id: "pol-inactive", name: "Inactive rule", condition: "x < 0", action: "reject", active: false, createdAt: now },
      ],
    })
    const res = await getPolicy(makeRequest("/api/policy"))
    const data = await json<{ id: string }[]>(res)
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe("pol-active")
  })

  it("filters by auctionId when provided", async () => {
    await createTestAuction()
    const { prisma } = await import("@/lib/db")
    const now = new Date().toISOString()
    await prisma.policyRule.createMany({
      data: [
        { id: "pol-global", name: "Global", condition: "always", action: "log", active: true, auctionId: null, createdAt: now },
        { id: "pol-specific", name: "Specific", condition: "auction-only", action: "flag", active: true, auctionId: "AUC-TEST", createdAt: now },
      ],
    })
    const res = await getPolicy(makeRequest("/api/policy?auctionId=AUC-TEST"))
    const data = await json<{ id: string }[]>(res)
    // Both global and auction-specific should be returned
    expect(data.map((r) => r.id)).toContain("pol-global")
    expect(data.map((r) => r.id)).toContain("pol-specific")
  })
})

describe("POST /api/policy", () => {
  it("creates a new rule and returns 201", async () => {
    const req = makeRequest("/api/policy", {
      method: "POST",
      body: { name: "Floor check", condition: "bid < floor", action: "reject_bid" },
    })
    const res = await postPolicy(req)
    expect(res.status).toBe(201)
    const data = await json<{ id: string; active: boolean }>(res)
    expect(data.id).toMatch(/^pol-/)
    expect(data.active).toBe(true)
  })

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest("/api/policy", { method: "POST", body: { name: "Incomplete" } })
    const res = await postPolicy(req)
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/policy", () => {
  it("updates a rule's name and condition", async () => {
    const create = await postPolicy(
      makeRequest("/api/policy", { method: "POST", body: { name: "Old name", condition: "x > 0", action: "accept" } })
    )
    const { id } = await json<{ id: string }>(create)

    const req = makeRequest("/api/policy", {
      method: "PATCH",
      body: { id, name: "New name", condition: "x > 1" },
    })
    const res = await patchPolicy(req)
    expect(res.status).toBe(200)
    const data = await json<{ name: string; condition: string }>(res)
    expect(data.name).toBe("New name")
    expect(data.condition).toBe("x > 1")
  })

  it("returns 400 when id is missing", async () => {
    const req = makeRequest("/api/policy", { method: "PATCH", body: { name: "no id" } })
    const res = await patchPolicy(req)
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/policy", () => {
  it("soft-deletes a rule (sets active: false)", async () => {
    const create = await postPolicy(
      makeRequest("/api/policy", { method: "POST", body: { name: "To delete", condition: "x", action: "y" } })
    )
    const { id } = await json<{ id: string }>(create)

    const res = await deletePolicy(makeRequest(`/api/policy?id=${id}`, { method: "DELETE" }))
    expect(res.status).toBe(200)
    const data = await json<{ active: boolean }>(res)
    expect(data.active).toBe(false)

    // Confirm it no longer shows in GET
    const list = await getPolicy(makeRequest("/api/policy"))
    const rules = await json<{ id: string }[]>(list)
    expect(rules.find((r) => r.id === id)).toBeUndefined()
  })

  it("returns 400 when id query param is missing", async () => {
    const res = await deletePolicy(makeRequest("/api/policy", { method: "DELETE" }))
    expect(res.status).toBe(400)
  })
})
