import { describe, it, expect } from "vitest"
import { GET as getSettlements, POST as postSettlement } from "@/app/api/settlements/route"
import { GET as getSettlement, POST as postSettlementAction } from "@/app/api/settlements/[id]/route"
import { createTestAuction, makeRequest, json } from "@/tests/helpers"
import { prisma } from "@/lib/db"

async function seedSettlement(id = "set-test") {
  await createTestAuction({ id: "AUC-SETTLE", joinCode: "STLXXZ" }).catch(() => {})
  return prisma.settlement.create({
    data: {
      id,
      auctionId: "AUC-SETTLE",
      winner: "Alice",
      amount: "3.2",
      asset: "SOL",
      wallet: "7Gf...k91",
      signature: "awaiting",
      status: "pending",
      network: "Solana devnet",
      paymentRequest: "solana:7Gf...k91?amount=3.2",
      verWallet: "pending",
      verAmount: "pending",
      confirmations: 0,
      updatedAt: new Date().toISOString(),
    },
  })
}

describe("GET /api/settlements", () => {
  it("returns empty array initially", async () => {
    const res = await getSettlements()
    const data = await json<unknown[]>(res)
    expect(data).toHaveLength(0)
  })

  it("returns existing settlements", async () => {
    await seedSettlement()
    const res = await getSettlements()
    const data = await json<{ id: string }[]>(res)
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe("set-test")
  })
})

describe("POST /api/settlements", () => {
  it("creates a settlement with status pending", async () => {
    await createTestAuction({ id: "AUC-NEW-SETTLE", joinCode: "NEWSTL" })
    const req = makeRequest("/api/settlements", {
      method: "POST",
      body: { auctionId: "AUC-NEW-SETTLE", winner: "Bob", amount: "1.5", asset: "SOL", wallet: "9Ab...xyz" },
    })
    const res = await postSettlement(req)
    expect(res.status).toBe(201)
    const data = await json<{ status: string; signature: string }>(res)
    expect(data.status).toBe("pending")
    expect(data.signature).toBe("awaiting-wallet-signature")
  })

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest("/api/settlements", { method: "POST", body: { auctionId: "AUC-X" } })
    const res = await postSettlement(req)
    expect(res.status).toBe(400)
  })
})

describe("GET /api/settlements/:id", () => {
  it("returns a single settlement", async () => {
    await seedSettlement()
    const req = makeRequest("/api/settlements/set-test")
    const res = await getSettlement(req, { params: Promise.resolve({ id: "set-test" }) })
    expect(res.status).toBe(200)
    const data = await json<{ id: string }>(res)
    expect(data.id).toBe("set-test")
  })

  it("returns 404 for unknown id", async () => {
    const req = makeRequest("/api/settlements/nope")
    const res = await getSettlement(req, { params: Promise.resolve({ id: "nope" }) })
    expect(res.status).toBe(404)
  })
})

describe("POST /api/settlements/:id (actions)", () => {
  it("verify action transitions to verifying", async () => {
    await seedSettlement()
    const req = makeRequest("/api/settlements/set-test", { method: "POST", body: { action: "verify" } })
    const res = await postSettlementAction(req, { params: Promise.resolve({ id: "set-test" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string; verification: { wallet: string; confirmations: number } }>(res)
    expect(data.status).toBe("verifying")
    expect(data.verification.wallet).toBe("matched")
    expect(data.verification.confirmations).toBe(1)
  })

  it("confirm action transitions to confirmed with 32 confirmations", async () => {
    await seedSettlement("set-confirm")
    // Advance to verifying first
    await prisma.settlement.update({ where: { id: "set-confirm" }, data: { status: "verifying" } })
    const req = makeRequest("/api/settlements/set-confirm", { method: "POST", body: { action: "confirm" } })
    const res = await postSettlementAction(req, { params: Promise.resolve({ id: "set-confirm" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string; verification: { confirmations: number }; network: string }>(res)
    expect(data.status).toBe("confirmed")
    expect(data.verification.confirmations).toBe(32)
    expect(data.network).toBe("Solana mainnet")
  })

  it("retry action resets to pending", async () => {
    await seedSettlement("set-retry")
    await prisma.settlement.update({ where: { id: "set-retry" }, data: { status: "failed" } })
    const req = makeRequest("/api/settlements/set-retry", { method: "POST", body: { action: "retry" } })
    const res = await postSettlementAction(req, { params: Promise.resolve({ id: "set-retry" }) })
    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    expect(data.status).toBe("pending")
  })

  it("returns 400 for unknown action", async () => {
    await seedSettlement("set-bad")
    const req = makeRequest("/api/settlements/set-bad", { method: "POST", body: { action: "launch" } })
    const res = await postSettlementAction(req, { params: Promise.resolve({ id: "set-bad" }) })
    expect(res.status).toBe(400)
  })
})
