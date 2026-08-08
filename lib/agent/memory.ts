/**
 * lib/agent/memory.ts
 *
 * Loads the last N messages for a bidder from the database and shapes them
 * into the format expected by the LLM classifier's context window.
 *
 * This gives the classifier conversational context so it can resolve
 * anaphoric replies like:
 *   agent: "What's your offer?"
 *   bidder: "60"       ← meaningless without the question before it
 */
import { prisma } from "@/lib/db"
import type { Message } from "@/lib/auction-store"

export type ConversationTurn = {
  role: "user" | "assistant"
  content: string
}

/**
 * Returns the last `limit` messages for a bidder, oldest-first, shaped as
 * OpenAI chat turns so they can be spliced directly into the messages array.
 */
export async function getConversationContext(
  bidderId: string,
  limit = 6
): Promise<ConversationTurn[]> {
  const rows = await prisma.message.findMany({
    where: { bidderId },
    orderBy: { at: "desc" },
    take: limit,
  })

  // Reverse so oldest is first (chronological reading order for the LLM)
  return rows
    .reverse()
    .map((row): ConversationTurn => ({
      role: row.author === "Auction agent" || row.author === "Operator" ? "assistant" : "user",
      content: `[${row.kind}] ${row.body}`,
    }))
}

/**
 * Returns raw Message objects for the last N messages — used by the test suite
 * and by callers that need the full record rather than chat turns.
 */
export async function getRecentMessages(bidderId: string, limit = 6): Promise<Message[]> {
  const rows = await prisma.message.findMany({
    where: { bidderId },
    orderBy: { at: "desc" },
    take: limit,
  })
  return rows.reverse().map((row) => ({
    id: row.id,
    bidderId: row.bidderId,
    author: row.author,
    body: row.body,
    kind: row.kind as Message["kind"],
    at: row.at,
  }))
}
