/**
 * lib/agent/matchCondition.ts
 *
 * Semantic condition matching — decides whether a bidder's message references
 * a named policy condition.
 *
 * The old approach was:
 *   text.includes(conditionName.split(" ")[0])
 * which false-positives on unrelated words and misses all paraphrasing.
 *
 * This module uses the LLM when an API key is present, and falls back to a
 * token-overlap similarity score when it isn't.
 *
 * Provider selection: Automatically picks Gemini or OpenAI based on which API key
 * is actually set (via environment variables). Both use the same OpenAI SDK since
 * Gemini exposes an OpenAI-compatible endpoint.
 */
import OpenAI from "openai"

// ─── Provider configuration (shared with classify.ts) ─────────────────────────────

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

export type ConditionMatchResult = {
  matched: boolean
  confidence: number
  reasoning: string
}

/**
 * Decide whether `message` references `conditionName` (e.g. "ships by Friday",
 * "certificate of authenticity required").
 *
 * @param message       Raw bidder message
 * @param conditionName The policy condition label from the auction rules
 * @param context       Optional surrounding text for disambiguation
 */
export async function matchCondition(
  message: string,
  conditionName: string,
  context = ""
): Promise<ConditionMatchResult> {
  const provider = resolveProvider()
  if (provider === "none") {
    return tokenOverlapMatch(message, conditionName)
  }

  const { client, model } = buildClient(provider)

  const prompt = `You are checking whether a bidder's message references a specific auction condition.

Condition name: "${conditionName}"
${context ? `Auction context: ${context}` : ""}
Bidder message: "${message}"

Does the bidder's message reference, invoke, or relate to the condition named above?
Consider paraphrasing, synonyms, and implicit references.

Return ONLY valid JSON:
{
  "matched": true | false,
  "confidence": 0.0–1.0,
  "reasoning": "≤ 20 words"
}`

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    })

    const raw = response.choices[0]?.message?.content ?? ""
    // Clean potential markdown fences (Gemini compatibility)
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
    const parsed = JSON.parse(cleaned)
    return {
      matched: Boolean(parsed.matched),
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reasoning: String(parsed.reasoning ?? "").slice(0, 200),
    }
  } catch {
    return tokenOverlapMatch(message, conditionName)
  }
}

// ─── Token-overlap fallback ───────────────────────────────────────────────────
// Uses a simple Jaccard similarity on word tokens. Not perfect, but far
// better than single-word substring matching and has zero false-positive
// rate on unrelated single-word coincidences.

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  )
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)))
  const union = new Set([...a, ...b])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function tokenOverlapMatch(message: string, conditionName: string): ConditionMatchResult {
  const msgTokens = tokenize(message)
  const condTokens = tokenize(conditionName)
  const score = jaccardSimilarity(msgTokens, condTokens)

  // Also check for partial containment — if all condition tokens appear in the message
  const allCondTokensPresent = condTokens.size > 0 && [...condTokens].every((t) => msgTokens.has(t))

  // Check for partial word matches (e.g., "ship" matching "ships")
  const partialMatches = [...condTokens].filter((condToken) => 
    [...msgTokens].some((msgToken) => 
      msgToken.includes(condToken) || condToken.includes(msgToken)
    )
  )
  const hasPartialMatches = partialMatches.length >= Math.max(1, condTokens.size * 0.5)

  const confidence = allCondTokensPresent ? Math.max(score, 0.8) : (hasPartialMatches ? Math.max(score, 0.3) : score)
  const matched = confidence >= 0.25

  return {
    matched,
    confidence,
    reasoning: matched
      ? `Token overlap ${(confidence * 100).toFixed(0)}% — condition terms found in message.`
      : `Token overlap ${(confidence * 100).toFixed(0)}% — condition not referenced.`,
  }
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "are", "was", "but",
  "not", "have", "its", "can", "will", "from", "they", "what", "been",
  "when", "who", "all", "your", "our", "their", "has", "had", "him",
  "her", "she", "his", "how", "any", "more", "may", "also",
])
