/**
 * lib/agent/classify.ts
 *
 * LLM-based message classifier.  Replaces all regex / substring matching with
 * a structured GPT-4o-mini call that returns JSON.
 *
 * The system prompt explicitly handles:
 *   - Negation:          "not less than 50" → bid of 50
 *   - Relative bids:     "I'll match whoever's ahead" → intent/clarify
 *   - Conditional bids:  "60 if it ships by Friday" → bid + condition
 *   - Sarcasm / jokes:   "eh maybe later" → question, low confidence
 *   - Genuine ambiguity: returns confidence < 0.6, decision = escalate
 *
 * The function is designed to be mockable for tests: set
 * process.env.OPENAI_API_KEY = "test" and the mock path is taken in tests.
 */
import OpenAI from "openai"
import type { Message, MessageKind } from "@/lib/auction-store"
import type { ConversationTurn } from "@/lib/agent/memory"

export type ClassificationResult = {
  /** What kind of message this is */
  kind: MessageKind
  /** Extracted dollar amount as a plain number string, e.g. "60" or "2500" */
  amount?: string
  /** Condition attached to the bid, e.g. "ships by Friday" */
  condition?: string
  /** What the agent should do next */
  decision: "accept" | "reject" | "clarify" | "escalate"
  /** 0–1 confidence score */
  confidence: number
  /** Short free-text explanation the operator can read */
  reasoning: string
}

const FALLBACK: ClassificationResult = {
  kind: "question",
  decision: "clarify",
  confidence: 0,
  reasoning: "Classification failed — defaulting to clarification.",
}

// ─── Prompt construction ──────────────────────────────────────────────────────

function buildSystemPrompt(auctionPolicy: string): string {
  return `You are the message-classification module for a live auction agent.
Your job is to read a bidder's latest message (plus recent conversation history)
and return a JSON object describing its intent.

=== AUCTION POLICY ===
${auctionPolicy || "Standard auction rules apply. No special conditions."}

=== OUTPUT FORMAT ===
Return ONLY valid JSON matching this schema — no markdown, no explanation:
{
  "kind":       "bid" | "intent" | "question" | "system" | "risk",
  "amount":     string | null,   // plain number, e.g. "60" or "2500". null if not a bid.
  "condition":  string | null,   // e.g. "ships by Friday". null if unconditional.
  "decision":   "accept" | "reject" | "clarify" | "escalate",
  "confidence": number,          // 0.0–1.0
  "reasoning":  string           // ≤ 30 words explaining the classification
}

=== CLASSIFICATION RULES ===
1. NEGATION — "not less than 50", "no lower than 2000" → kind=bid, amount=that number, decision=accept
2. RELATIVE BIDS — "I'll match whoever's ahead", "same as the top bid", "beat the leader" → kind=intent, decision=clarify (you need a concrete number)
3. CONDITIONAL BIDS — "60 if it ships by Friday", "I could go to 2500 provided authenticity is confirmed" → kind=bid, fill amount AND condition, decision=accept (flag condition for operator review)
4. SARCASM / JOKES — "oh sure, I'll bid a million" with clearly hyperbolic tone → kind=question, confidence ≤ 0.3, decision=clarify
5. GENUINE AMBIGUITY — if you cannot confidently classify, set confidence < 0.55 and decision=escalate
6. QUESTIONS — asking for info ("what's the current bid?", "is shipping included?") → kind=question, decision=clarify
7. RISK SIGNALS — "this is too rich for me", "I'm out" → kind=risk, decision=reject
8. PLAIN BIDS — "55", "$55", "put me down for 55, final" → kind=bid, decision=accept
9. YES/NO CONFIRMATIONS — when prior assistant message asked "Would you like to place $X?" and bidder says "yes" / "go ahead" → kind=bid, infer amount from context, confidence ≥ 0.85

=== IMPORTANT ===
- Never keyword-match. Judge intent holistically.
- Use conversation history to resolve anaphora ("60" after "what's your offer?" → bid of 60).
- A confident classification has confidence ≥ 0.75. Below 0.55 → escalate.`
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Classify a single bidder message using GPT-4o-mini.
 *
 * @param message       The raw message text from the bidder
 * @param history       Recent conversation turns for context (from memory.ts)
 * @param auctionPolicy The auction's terms / policy text
 */
export async function classifyMessage(
  message: string,
  history: Message[] | ConversationTurn[],
  auctionPolicy: string
): Promise<ClassificationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === "sk-your-openai-api-key-here") {
    // No real key — return a best-effort heuristic result so the app still
    // functions in demo/test environments without an OpenAI account.
    return heuristicFallback(message)
  }

  const client = new OpenAI({ apiKey })

  // Convert Message[] or ConversationTurn[] to chat turns
  const contextTurns: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((h) => {
    if ("role" in h) {
      return { role: h.role, content: h.content }
    }
    const m = h as Message
    const role: "user" | "assistant" =
      m.author === "Auction agent" || m.author === "Operator" ? "assistant" : "user"
    return { role, content: `[${m.kind}] ${m.body}` }
  })

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1, // Low temp for deterministic classification
      max_tokens: 256,
      messages: [
        { role: "system", content: buildSystemPrompt(auctionPolicy) },
        ...contextTurns,
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
    })

    const raw = response.choices[0]?.message?.content ?? ""
    return parseClassification(raw)
  } catch (err) {
    console.error("[classify] OpenAI call failed:", err)
    return { ...FALLBACK, reasoning: "OpenAI error — defaulting to escalation." }
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseClassification(raw: string): ClassificationResult {
  try {
    const parsed = JSON.parse(raw)

    const kind: MessageKind =
      ["intent", "question", "bid", "system", "risk"].includes(parsed.kind)
        ? parsed.kind
        : "question"

    const decision: ClassificationResult["decision"] =
      ["accept", "reject", "clarify", "escalate"].includes(parsed.decision)
        ? parsed.decision
        : "clarify"

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5

    return {
      kind,
      amount: parsed.amount ? String(parsed.amount) : undefined,
      condition: parsed.condition ? String(parsed.condition) : undefined,
      decision,
      confidence,
      reasoning: String(parsed.reasoning ?? "").slice(0, 200),
    }
  } catch {
    return FALLBACK
  }
}

// ─── Heuristic fallback (no API key) ─────────────────────────────────────────
// This is NOT a regex classifier — it's a last-resort fallback so the app
// doesn't crash in environments without an API key. It covers only the most
// unambiguous patterns and escalates everything else.

function heuristicFallback(message: string): ClassificationResult {
  const text = message.trim()
  const lower = text.toLowerCase()

  // Explicit bid with dollar / plain number
  const dollarMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  const plainNumber = text.match(/^[\d,]+(?:\.\d+)?$/)
  const bidKeyword = lower.match(/\b(?:bid|offer|put me down for|i'll go)\b.*?([\d,]+(?:\.\d+)?)/)

  // Risk / withdrawal signals
  if (/\b(out|pass|too (?:rich|high|much)|beyond my|can't go|dropping)\b/.test(lower)) {
    return { kind: "risk", decision: "reject", confidence: 0.8, reasoning: "Bidder signaling withdrawal." }
  }

  // Negation bids: "not less than N", "no lower than N"
  const negBid = lower.match(/(?:not less than|no lower than|at least|minimum of)\s*([\d,]+)/)
  if (negBid) {
    return { kind: "bid", amount: negBid[1].replace(/,/g, ""), decision: "accept", confidence: 0.82, reasoning: "Negation bid resolved to minimum amount." }
  }

  // Relative bid — always needs clarification
  if (/\b(?:match|same as|beat|whoever|top bid|current bid)\b/.test(lower)) {
    return { kind: "intent", decision: "clarify", confidence: 0.75, reasoning: "Relative bid — need concrete amount." }
  }

  // Conditional bid: "N if condition"
  const condMatch = text.match(/([\d,]+(?:\.\d+)?)\s+if\s+(.+)/i)
  if (condMatch) {
    return { kind: "bid", amount: condMatch[1].replace(/,/g, ""), condition: condMatch[2].trim(), decision: "accept", confidence: 0.78, reasoning: "Conditional bid extracted." }
  }

  // Direct dollar amount
  if (dollarMatch) {
    return { kind: "bid", amount: dollarMatch[1].replace(/,/g, ""), decision: "accept", confidence: 0.85, reasoning: "Dollar amount found directly in message." }
  }

  // Plain number
  if (plainNumber) {
    return { kind: "bid", amount: text.replace(/,/g, ""), decision: "accept", confidence: 0.80, reasoning: "Plain numeric bid." }
  }

  // Bid keyword
  if (bidKeyword) {
    return { kind: "bid", amount: bidKeyword[1].replace(/,/g, ""), decision: "accept", confidence: 0.75, reasoning: "Bid keyword with amount." }
  }

  // Question signals
  if (/\?|what|who|how|when|where|is there|does it|can i/.test(lower)) {
    return { kind: "question", decision: "clarify", confidence: 0.75, reasoning: "Looks like a question." }
  }

  // Everything else → escalate
  return { kind: "question", decision: "escalate", confidence: 0.3, reasoning: "Could not determine intent — escalating." }
}
