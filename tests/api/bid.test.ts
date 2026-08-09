import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST as postBid } from "@/app/api/auctions/[auctionId]/bid/route"
import { createTestAuction, createTestBidder, makeRequest, json, calculateTestMinIncrement } from "@/tests/helpers"

const AUC = "AUC-BID-DIRECT"
const AUC_LLM = "AUC-BID-LLM"

// Mock the classifier so bid tests don't need an OpenAI key.
vi.mock("@/lib/agent/classify", () => ({
  classifyMessage: vi.fn(),
}))

import { classifyMessage } from "@/lib/agent/classify"
const mockClassify = vi.mocked(classifyMessage)

// Mock the answerQuestion function so tests don't need an LLM API key.
vi.mock("@/lib/agent/answer", () => ({
  answerQuestion: vi.fn(),
}))

import { answerQuestion } from "@/lib/agent/answer"
const mockAnswerQuestion = vi.mocked(answerQuestion)

describe("POST /api/auctions/:auctionId/bid — direct numeric bid", () => {
  beforeEach(async () => {
    await createTestAuction({ id: AUC, floor: "$100", topBid: "$0", joinCode: "DIRBID" })
    await createTestBidder(AUC, { id: "bd-test-d" })
  })

  it("accepts a valid bid above the floor", async () => {
    const req = makeRequest(`/api/auctions/${AUC}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-d", amount: "$150" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC }) })
    expect(res.status).toBe(200)
    const data = await json<{ auction: { topBid: string } }>(res)
    expect(data.auction.topBid).toBe("$150.00")
  })

  it("rejects a bid below the floor", async () => {
    const req = makeRequest(`/api/auctions/${AUC}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-d", amount: "$50" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/floor/)
  })

  it("rejects a bid that does not beat the current top", async () => {
    await createTestAuction({ id: "AUC-TOP-B", floor: "$100", topBid: "$500", joinCode: "TOPBD1" })
    await createTestBidder("AUC-TOP-B", { id: "bd-top-b" })
    const req = makeRequest("/api/auctions/AUC-TOP-B/bid", {
      method: "POST",
      body: { bidderId: "bd-top-b", amount: "$499" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-TOP-B" }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/top bid/)
  })

  it("returns 409 for a closed auction", async () => {
    await createTestAuction({ id: "AUC-CLSD-B", status: "closed", joinCode: "CLSD01" })
    await createTestBidder("AUC-CLSD-B", { id: "bd-closed-b" })
    const req = makeRequest("/api/auctions/AUC-CLSD-B/bid", {
      method: "POST",
      body: { bidderId: "bd-closed-b", amount: "$200" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-CLSD-B" }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/closed/)
  })

  it("returns 400 when bidderId is missing", async () => {
    const req = makeRequest(`/api/auctions/${AUC}/bid`, {
      method: "POST",
      body: { amount: "$150" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC }) })
    expect(res.status).toBe(400)
  })

  it("rejects a bid that beats top bid but not by the minimum increment", async () => {
    await createTestAuction({ id: "AUC-INC-B", floor: "$100", topBid: "$1000", minIncrement: "$50", joinCode: "INCB01" })
    await createTestBidder("AUC-INC-B", { id: "bd-inc-b" })
    const req = makeRequest("/api/auctions/AUC-INC-B/bid", {
      method: "POST",
      body: { bidderId: "bd-inc-b", amount: "$1025" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-INC-B" }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/at least \$50/i)
  })

  it("auto-closes auction when endsAt has passed and rejects bid", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString() // 1 day ago
    await createTestAuction({ id: "AUC-EXP-B", floor: "$100", topBid: "$500", endsAt: pastDate, joinCode: "EXPB01" })
    await createTestBidder("AUC-EXP-B", { id: "bd-exp-b" })
    const req = makeRequest("/api/auctions/AUC-EXP-B/bid", {
      method: "POST",
      body: { bidderId: "bd-exp-b", amount: "$600" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-EXP-B" }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/closed/i)
  })

  it("accepts bids on auction with endsAt: null (unlimited auction)", async () => {
    await createTestAuction({ id: "AUC-UNL-B", floor: "$100", topBid: "$500", endsAt: null, joinCode: "UNLB01" })
    await createTestBidder("AUC-UNL-B", { id: "bd-unl-b" })
    const req = makeRequest("/api/auctions/AUC-UNL-B/bid", {
      method: "POST",
      body: { bidderId: "bd-unl-b", amount: "$600" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-UNL-B" }) })
    expect(res.status).toBe(200)
    const data = await json<{ auction: { topBid: string } }>(res)
    expect(data.auction.topBid).toBe("$600.00")
  })

  it("rounds fractional bids and validates against increment", async () => {
    await createTestAuction({ id: "AUC-FRC-B", floor: "$100", topBid: "$1000", minIncrement: "$50", joinCode: "FRCB01" })
    await createTestBidder("AUC-FRC-B", { id: "bd-frc-b" })
    const req = makeRequest("/api/auctions/AUC-FRC-B/bid", {
      method: "POST",
      body: { bidderId: "bd-frc-b", amount: "1001.00000001" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: "AUC-FRC-B" }) })
    expect(res.status).toBe(409)
    const data = await json<{ error: string }>(res)
    expect(data.error).toMatch(/at least \$50/i)
  })

})

describe("calculateDefaultMinIncrement helper", () => {
  it("calculates 1% of floor correctly", () => {
    expect(calculateTestMinIncrement("$100")).toBe("$1.00")
    expect(calculateTestMinIncrement("$1,000")).toBe("$10.00")
    expect(calculateTestMinIncrement("$50")).toBe("$0.50")
    expect(calculateTestMinIncrement("$1,800")).toBe("$18.00")
    expect(calculateTestMinIncrement("$25")).toBe("$0.25")
  })

  it("handles edge cases with fallback to $1", () => {
    expect(calculateTestMinIncrement("invalid")).toBe("$1")
    expect(calculateTestMinIncrement("$0")).toBe("$1")
    expect(calculateTestMinIncrement("-$100")).toBe("$1") // Negative values should also fallback
  })
})

describe("POST /api/auctions/:auctionId/bid — rawMessage LLM path", () => {
  beforeEach(async () => {
    await createTestAuction({ id: AUC_LLM, floor: "$100", topBid: "$0", joinCode: "LLMBID" })
    await createTestBidder(AUC_LLM, { id: "bd-test-l" })
    mockClassify.mockClear()
    mockAnswerQuestion.mockClear()
  })

  it("places a bid when classifier returns accept with amount", async () => {
    mockClassify.mockResolvedValueOnce({
      kind: "bid",
      amount: "200",
      decision: "accept",
      confidence: 0.9,
      reasoning: "Clear bid of $200.",
    })
    const req = makeRequest(`/api/auctions/${AUC_LLM}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-l", rawMessage: "put me down for 200, final" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC_LLM }) })
    expect(res.status).toBe(200)
    const data = await json<{ auction: { topBid: string } }>(res)
    expect(data.auction.topBid).toBe("$200.00")
  })

  it("returns 202 escalation when classifier decision is escalate", async () => {
    mockClassify.mockResolvedValueOnce({
      kind: "bid",
      decision: "escalate",
      confidence: 0.4,
      reasoning: "Could not determine intent.",
    })
    const req = makeRequest(`/api/auctions/${AUC_LLM}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-l", rawMessage: "I'll match whoever's ahead, within reason" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC_LLM }) })
    expect(res.status).toBe(202)
    const data = await json<{ needsEscalation: boolean }>(res)
    expect(data.needsEscalation).toBe(true)
  })

  it("returns clarification when classifier decision is clarify", async () => {
    mockClassify.mockResolvedValueOnce({
      kind: "bid",
      decision: "clarify",
      confidence: 0.7,
      reasoning: "What's the exact amount you'd like to bid?",
    })
    const req = makeRequest(`/api/auctions/${AUC_LLM}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-l", rawMessage: "maybe around there" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC_LLM }) })
    expect(res.status).toBe(200)
    const data = await json<{ needsClarification: boolean; question: string }>(res)
    expect(data.needsClarification).toBe(true)
    expect(data.question).toBeTruthy()
  })

  it("answers informational questions with real auction data", async () => {
    mockClassify.mockResolvedValueOnce({
      kind: "question",
      decision: "clarify",
      confidence: 0.8,
      reasoning: "Bidder is asking for information.",
    })
    mockAnswerQuestion.mockResolvedValueOnce("The current top bid is $0.")
    const req = makeRequest(`/api/auctions/${AUC_LLM}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-l", rawMessage: "what's the top bid?" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC_LLM }) })
    expect(res.status).toBe(200)
    const data = await json<{ answered: boolean; answer: string }>(res)
    expect(data.answered).toBe(true)
    expect(data.answer).toBe("The current top bid is $0.")
  })

  it("escalates when confidence is below 0.55 even if decision is accept", async () => {
    mockClassify.mockResolvedValueOnce({
      kind: "bid",
      amount: "150",
      decision: "accept",
      confidence: 0.4,
      reasoning: "Barely a bid.",
    })
    const req = makeRequest(`/api/auctions/${AUC_LLM}/bid`, {
      method: "POST",
      body: { bidderId: "bd-test-l", rawMessage: "eh sure 150 or whatever" },
    })
    const res = await postBid(req, { params: Promise.resolve({ auctionId: AUC_LLM }) })
    expect(res.status).toBe(202)
    const data = await json<{ needsEscalation: boolean }>(res)
    expect(data.needsEscalation).toBe(true)
  })
})
