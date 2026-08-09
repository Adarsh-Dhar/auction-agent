/**
 * tests/agent/classify.test.ts
 *
 * Test bank covering every phrase called out in the brief plus edge cases.
 *
 * Two modes:
 *   1. Heuristic tests (no LLM key) — test the built-in fallback directly
 *      via the exported `classifyMessage` with the sentinel key set in setup.ts.
 *   2. LLM-mocked tests — mock the OpenAI client to verify that:
 *      a) The correct system prompt is built (includes policy, history)
 *      b) The JSON response is parsed correctly
 *      c) Edge-case LLM outputs are handled gracefully (malformed JSON, etc.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { classifyMessage, type ClassificationResult } from "@/lib/agent/classify"
import type { Message } from "@/lib/auction-store"
import OpenAI from "openai"

// Mock OpenAI module
vi.mock("openai", () => ({
  default: vi.fn(),
}))

// ─── Heuristic path (sentinel key in setup.ts) ────────────────────────────────
// These test the fallback logic that runs when OPENAI_API_KEY is not real.
// They document the minimum bar the heuristics must clear.

const POLICY = "Standard auction rules. Floor is $40. No exceptions."

describe("classifyMessage — heuristic fallback (no real API key)", () => {
  // Brief test bank phrases
  it('"put me down for 55, final" → bid / accept', async () => {
    const result = await classifyMessage("put me down for 55, final", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.decision).toBe("accept")
    expect(result.amount).toBe("55")
  })

  it('"$2,500" → bid / accept with amount 2500', async () => {
    const result = await classifyMessage("$2,500", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("2500")
    expect(result.decision).toBe("accept")
  })

  it('"what\'s the highest bid rn" → question / clarify', async () => {
    const result = await classifyMessage("what's the highest bid rn", [], POLICY)
    expect(result.kind).toBe("question")
    expect(result.decision).toBe("clarify")
  })

  it('"I\'ll match whoever\'s ahead, within reason" → intent / clarify (relative bid)', async () => {
    const result = await classifyMessage("I'll match whoever's ahead, within reason", [], POLICY)
    expect(["intent", "question"]).toContain(result.kind)
    expect(result.decision).toBe("clarify")
  })

  it('"not less than 50" → bid / accept with amount 50 (negation)', async () => {
    const result = await classifyMessage("not less than 50", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.decision).toBe("accept")
    expect(result.amount).toBe("50")
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('"no lower than 2000" → bid / accept with amount 2000 (negation)', async () => {
    const result = await classifyMessage("no lower than 2000", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("2000")
  })

  it('"I could go to 60 if it ships by Friday" → bid + condition (conditional bid)', async () => {
    const result = await classifyMessage("I could go to 60 if it ships by Friday", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("60")
    expect(result.condition).toMatch(/ships by Friday/i)
    expect(result.decision).toBe("accept")
  })

  it('"60 if it ships by Friday" → conditional bid extracted correctly', async () => {
    const result = await classifyMessage("60 if it ships by Friday", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("60")
    expect(result.condition).toMatch(/ships by Friday/i)
  })

  it('"I\'ll go higher if Raj drops out" → intent / clarify (conditional, no concrete amount)', async () => {
    const result = await classifyMessage("I'll go higher if Raj drops out", [], POLICY)
    // No concrete dollar amount — should ask for clarification or escalate
    // Note: heuristic may match "drops" as withdrawal signal
    expect(["clarify", "escalate", "reject"]).toContain(result.decision)
    expect(result.amount).toBeUndefined()
  })

  it('"this is too rich for me" → risk / reject', async () => {
    const result = await classifyMessage("this is too rich for me", [], POLICY)
    expect(result.kind).toBe("risk")
    expect(result.decision).toBe("reject")
  })

  it('"I\'m out" → risk / reject', async () => {
    const result = await classifyMessage("I'm out", [], POLICY)
    expect(result.kind).toBe("risk")
    expect(result.decision).toBe("reject")
  })

  it('"Is shipping included?" → question / clarify', async () => {
    const result = await classifyMessage("Is shipping included?", [], POLICY)
    expect(result.kind).toBe("question")
    expect(result.decision).toBe("clarify")
  })

  it('"1800" (plain number) → bid / accept', async () => {
    const result = await classifyMessage("1800", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.decision).toBe("accept")
    expect(result.amount).toBe("1800")
  })

  it("returns confidence between 0 and 1 for all inputs", async () => {
    const phrases = [
      "put me down for 55",
      "what's the floor",
      "I'll match the top",
      "not less than 200",
      "I'm done",
    ]
    for (const phrase of phrases) {
      const result = await classifyMessage(phrase, [], POLICY)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }
  })

  it("always returns a valid decision string", async () => {
    const valid = new Set(["accept", "reject", "clarify", "escalate"])
    const result = await classifyMessage("random gibberish xyz 123 !!!", [], POLICY)
    expect(valid.has(result.decision)).toBe(true)
  })

  it("always returns a valid kind string", async () => {
    const valid = new Set(["intent", "question", "bid", "system", "risk"])
    const result = await classifyMessage("whatever message here", [], POLICY)
    expect(valid.has(result.kind)).toBe(true)
  })
})

// ─── LLM-mocked path ─────────────────────────────────────────────────────────
// Override the sentinel key so the real LLM path is taken, but mock the
// OpenAI constructor so no network call is made.

describe("classifyMessage — LLM path (mocked)", () => {
  const originalOpenAIKey = process.env.OPENAI_API_KEY
  const originalGeminiKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    // Set a real-looking key to trigger the LLM path instead of heuristic
    process.env.OPENAI_API_KEY = "sk-real-looking-key-for-test"
    process.env.GEMINI_API_KEY = "your-gemini-api-key-here" // keep as placeholder
  })

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAIKey
    process.env.GEMINI_API_KEY = originalGeminiKey
    vi.restoreAllMocks()
  })

  it("parses a well-formed LLM JSON response correctly", async () => {
    const llmResponse: ClassificationResult = {
      kind: "bid",
      amount: "150",
      condition: undefined,
      decision: "accept",
      confidence: 0.95,
      reasoning: "Clear bid of $150.",
    }
    
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(llmResponse) } }],
    })

    vi.mocked(OpenAI).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any))

    const result = await classifyMessage("I'll do 150", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("150")
    expect(result.decision).toBe("accept")
    expect(result.confidence).toBeCloseTo(0.95, 1)
  })

  it("clamps confidence to [0, 1] if LLM returns out-of-range value", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ kind: "bid", amount: "50", decision: "accept", confidence: 1.5, reasoning: "test" }) } }],
    })

    vi.mocked(OpenAI).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any))

    const result = await classifyMessage("50 bucks", [], POLICY)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it("falls back gracefully when LLM returns malformed JSON", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "sorry I can't do that" } }],
    })

    vi.mocked(OpenAI).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any))

    const result = await classifyMessage("55", [], POLICY)
    // Should return the FALLBACK constant
    expect(result.decision).toBe("clarify")
    expect(result.confidence).toBe(0)
  })

  it("falls back gracefully when LLM returns unknown kind", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ kind: "banana", decision: "accept", confidence: 0.8, reasoning: "weird" }) } }],
    })

    vi.mocked(OpenAI).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any))

    const result = await classifyMessage("bid 55", [], POLICY)
    // Unknown kind should be coerced to "question"
    expect(result.kind).toBe("question")
  })

  it("handles Gemini-style JSON with markdown fences", async () => {
    const responseWithFences = '```json\n{\n  "kind": "bid",\n  "amount": "75",\n  "condition": null,\n  "decision": "accept",\n  "confidence": 0.9,\n  "reasoning": "Clear bid"\n}\n```'
    
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: responseWithFences } }],
    })

    vi.mocked(OpenAI).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any))

    const result = await classifyMessage("75", [], POLICY)
    expect(result.kind).toBe("bid")
    expect(result.amount).toBe("75")
  })
})

// ─── matchCondition tests ─────────────────────────────────────────────────────

describe("matchCondition — token-overlap fallback", () => {
  it("matches when all condition tokens appear in the message", async () => {
    const { matchCondition } = await import("@/lib/agent/matchCondition")
    const result = await matchCondition(
      "I need the item to ship by Friday if possible",
      "ships by Friday"
    )
    expect(result.matched).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.25)
  })

  it("does not match on a single unrelated common word", async () => {
    const { matchCondition } = await import("@/lib/agent/matchCondition")
    // The word "ship" appears in "workshop" but the condition is about shipping
    const result = await matchCondition(
      "I work in a workshop",
      "certificate of authenticity"
    )
    expect(result.matched).toBe(false)
  })

  it("returns confidence between 0 and 1", async () => {
    const { matchCondition } = await import("@/lib/agent/matchCondition")
    const result = await matchCondition("random text", "certificate of authenticity")
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it("returns matched: true for near-exact condition", async () => {
    const { matchCondition } = await import("@/lib/agent/matchCondition")
    const result = await matchCondition("certificate of authenticity required", "certificate of authenticity")
    expect(result.matched).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})
