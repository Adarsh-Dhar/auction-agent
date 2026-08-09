import { NextResponse } from "next/server"
import { findBidderById, getMessages, addMessage, addAgentMessage, emit, getAuction, getBiddersForAuction } from "@/lib/auction-store"
import { classifyMessage } from "@/lib/agent/classify"
import { answerQuestion } from "@/lib/agent/answer"
import { getConversationContext } from "@/lib/agent/memory"
import { prisma } from "@/lib/db"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ bidderId: string }> }
) {
  const { bidderId } = await params
  const [bidder, messages] = await Promise.all([
    findBidderById(bidderId),
    getMessages(bidderId),
  ])
  if (!bidder) return NextResponse.json({ error: "Bidder not found" }, { status: 404 })
  return NextResponse.json({ bidder, messages })
}

/**
 * POST /api/bidders/:bidderId
 *
 * Two call patterns:
 *
 * 1. Operator reply  — { body: string, author?: "Operator" }
 *    Adds a message from the operator to the thread. No classification needed.
 *
 * 2. Inbound bidder message — { body: string, author: string, classify?: true }
 *    Classifies the message with the LLM, stamps the correct `kind`, and
 *    also stores the classification result in the message kind field.
 *    Conversation history (last 6 messages) is loaded as context automatically.
 *
 * emit("message.created") fires inside addMessage / addAgentMessage for all paths.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bidderId: string }> }
) {
  const { bidderId } = await params
  const reqBody = await request.json().catch(() => ({ body: "" }))
  const messageText: string = reqBody.body ?? ""
  const author: string = reqBody.author ?? "Operator"
  const shouldClassify: boolean = reqBody.classify === true || (author !== "Operator" && author !== "Auction agent")

  if (!messageText?.trim()) {
    return NextResponse.json({ error: "body is required." }, { status: 400 })
  }

  // ── Operator messages — no classification needed ──────────────────────────
  if (!shouldClassify) {
    const message = await addMessage(bidderId, messageText, "system")
    return NextResponse.json(message, { status: 201 })
  }

  // ── Bidder inbound message — classify then store ──────────────────────────
  // Find which auction this bidder belongs to (needed for policy context)
  const bidderRow = await prisma.bidder.findUnique({ where: { id: bidderId } })
  if (!bidderRow) return NextResponse.json({ error: "Bidder not found" }, { status: 404 })

  const auctionRow = await prisma.auction.findUnique({ where: { id: bidderRow.auctionId } })
  const auctionPolicy = auctionRow?.terms ?? ""

  // Load conversation context (last 6 turns) for the classifier
  const context = await getConversationContext(bidderId, 6)

  // Run LLM classification
  const classification = await classifyMessage(messageText, context, auctionPolicy)

  // Persist the bidder's message with the classified kind
  const stored = await prisma.message.create({
    data: {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      bidderId,
      author,
      body: messageText,
      kind: classification.kind,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    },
  })

  // Fire SSE so mission control sees it immediately
  emit("message.created", { ...stored, classification })

  // Genuine informational question — answer it with real auction data
  // instead of echoing the classifier's internal reasoning back as if it
  // were a clarifying question aimed at the bidder.
  if (classification.kind === "question") {
    const auction = await getAuction(bidderRow.auctionId)
    if (auction) {
      const bidders = await getBiddersForAuction(bidderRow.auctionId)
      const answer = await answerQuestion(messageText, auction, bidders)
      await addAgentMessage(bidderId, answer, "system")
    }
  } else if (classification.decision === "clarify") {
    // Auto-reply for genuine clarification requests (e.g. a relative bid
    // with no concrete number — the agent needs the bidder to say more).
    await addAgentMessage(
      bidderId,
      classification.reasoning || "Could you clarify — I want to make sure I record your intent correctly.",
      "system"
    )
  }

  return NextResponse.json(
    {
      message: { id: stored.id, bidderId: stored.bidderId, author: stored.author, body: stored.body, kind: stored.kind, at: stored.at },
      classification,
    },
    { status: 201 }
  )
}
