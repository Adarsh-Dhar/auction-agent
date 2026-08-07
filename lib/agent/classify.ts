import type { MessageKind } from "@/lib/auction-store"
export type Classification = { kind: MessageKind; decision: "accept" | "reject" | "escalate" | "respond"; amountCents?: number; condition?: string }
export function classifyMessage(text: string): Classification {
  const amount = text.replace(/,/g, "").match(/\$([0-9]+(?:\.[0-9]{1,2})?)/)
  const amountCents = amount ? Math.round(Number(amount[1]) * 100) : undefined
  if (amountCents) return { kind: "bid", decision: "accept", amountCents }
  if (/reserve|floor|highest|leader|hidden bid|exception/i.test(text)) return { kind: "probe", decision: "escalate" }
  if (/can't|cannot|won't|condition|contingent|subject to/i.test(text)) return { kind: "condition", decision: "escalate", condition: text }
  if (/\?|how|when|where|what|can you/i.test(text)) return { kind: "question", decision: "respond" }
  if (/maybe|thinking|budget|too high|not sure/i.test(text)) return { kind: "risk", decision: "escalate" }
  return { kind: "chatter", decision: "respond" }
}
