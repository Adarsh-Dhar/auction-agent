/**
 * lib/agent/answer.ts
 *
 * Answers genuine informational questions from bidders — "what's the top
 * bid?", "list all the bids", "when does this close?" — using the auction's
 * real current data.
 *
 * This is deliberately separate from classify.ts's "clarify" decision.
 * "clarify" means the AGENT needs more info from the BIDDER (e.g. a relative
 * bid with no concrete number attached). A question is the opposite case —
 * the bidder is asking the agent something, and deserves a real answer, not
 * a bounce-back or the classifier's internal reasoning text.
 */
import OpenAI from "openai"
import type { Auction, Bidder } from "@/lib/auction-store"

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite"

function isRealKey(key: string | undefined, placeholder: string): boolean {
  return !!key && key !== placeholder && key.trim() !== ""
}

function resolveProvider(): "gemini" | "openai" | "none" {
  if (isRealKey(process.env.GEMINI_API_KEY, "your-gemini-api-key-here")) return "gemini"
  if (isRealKey(process.env.OPENAI_API_KEY, "sk-your-openai-api-key-here")) return "openai"
  return "none"
}

function buildClient(provider: "gemini" | "openai") {
  if (provider === "gemini") {
    return {
      client: new OpenAI({ apiKey: process.env.GEMINI_API_KEY!, baseURL: GEMINI_BASE_URL }),
      model: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    }
  }
  return {
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  }
}

function buildDataBlock(auction: Auction, bidders: Bidder[]): string {
  return `Auction: ${auction.title} (${auction.id})
Status: ${auction.status}
Top bid: ${auction.topBid}
Floor: ${auction.floor}
Ends: ${auction.endsAt}
Terms: ${auction.terms || "None specified"}
Bidders (${bidders.length}):
${bidders.map((b) => `- ${b.name} (${b.handle}): last bid ${b.lastBid}, status ${b.status}`).join("\n") || "- none yet"}`
}

/**
 * Answer a bidder's genuine question using the auction's live data.
 * Falls back to a small heuristic (top bid / bidder list) if no API key is set.
 */
export async function answerQuestion(
  question: string,
  auction: Auction,
  bidders: Bidder[]
): Promise<string> {
  const provider = resolveProvider()
  const dataBlock = buildDataBlock(auction, bidders)

  if (provider === "none") {
    const lower = question.toLowerCase()
    if (/\b(top|current|highest)\s+bid\b/.test(lower)) {
      return `The current top bid is ${auction.topBid}. The floor is ${auction.floor}.` 
    }
    if (/\blist|all bids|who('| i)s bidding|bidders\b/.test(lower)) {
      if (bidders.length === 0) return "No bidders have joined this auction yet."
      return "Current bidders: " + bidders.map((b) => `${b.name} at ${b.lastBid}`).join(", ") + "."
    }
    return `Current top bid is ${auction.topBid}, floor is ${auction.floor}. Let me know if you'd like more detail.` 
  }

  const { client, model } = buildClient(provider)
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are an auction agent answering a bidder's question using ONLY the data below. Be concise (2-4 sentences), friendly, and factual. Never invent numbers not present in the data.\n\n${dataBlock}`,
        },
        { role: "user", content: question },
      ],
    })
    return (
      response.choices[0]?.message?.content?.trim() ||
      `Current top bid is ${auction.topBid}, floor is ${auction.floor}.` 
    )
  } catch (err) {
    console.error("[answerQuestion] LLM call failed:", err)
    return `Current top bid is ${auction.topBid}, floor is ${auction.floor}.` 
  }
}
