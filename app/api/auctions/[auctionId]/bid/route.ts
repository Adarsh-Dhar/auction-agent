import { NextResponse } from "next/server"
import { placeBid, getAuction, getMessages, createEscalation, findBidderById } from "@/lib/auction-store"
import { classifyMessage } from "@/lib/agent/classify"

const REASON_MESSAGES: Record<string, string> = {
  not_found: "Auction or bidder not found.",
  auction_closed: "This auction is closed and no longer accepting bids.",
  invalid_amount: "That doesn't look like a valid bid amount.",
  below_floor: "That bid is below the reserve floor.",
  below_top_bid: "That bid doesn't beat the current top bid.",
}

/**
 * POST /api/auctions/:auctionId/bid
 *
 * Body:
 *   { bidderId: string, amount: string | number }          — direct numeric bid
 *   { bidderId: string, rawMessage: string }               — natural language, classified by LLM
 *   { bidderId: string, amount: string, rawMessage: string } — both; rawMessage used for classification
 *
 * Emits: bid.placed (on success), escalation.created (on low confidence / escalate decision)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  const { auctionId } = await params
  const body = await request.json().catch(() => ({}))

  if (!body.bidderId) {
    return NextResponse.json({ error: "bidderId is required." }, { status: 400 })
  }

  // ── LLM classification path ───────────────────────────────────────────────
  if (body.rawMessage && !body.amount) {
    const auction = await getAuction(auctionId)
    if (!auction) return NextResponse.json({ error: REASON_MESSAGES.not_found }, { status: 404 })

    const history = await getMessages(body.bidderId)
    const classification = await classifyMessage(body.rawMessage, history, auction.terms)

    // Low-confidence or explicit escalation → create escalation, don't place bid
    if (classification.decision === "escalate" || classification.confidence < 0.55) {
      const bidder = await findBidderById(body.bidderId)
      const escalation = await createEscalation({
        auctionId,
        bidderId: body.bidderId,
        bidderName: bidder?.name ?? body.bidderId,
        reason: `Ambiguous message — "${body.rawMessage.slice(0, 80)}" (confidence ${(classification.confidence * 100).toFixed(0)}%)`,
        severity: classification.confidence < 0.4 ? "high" : "medium",
      })
      return NextResponse.json(
        { needsEscalation: true, escalation, classification },
        { status: 202 }
      )
    }

    // Agent requests clarification
    if (classification.decision === "clarify") {
      return NextResponse.json(
        { needsClarification: true, question: classification.reasoning, classification },
        { status: 200 }
      )
    }

    // If the LLM extracted a bid amount, use it
    if (classification.kind === "bid" && classification.amount) {
      body.amount = classification.amount
    } else {
      // Not a bid — log it and return the classification for the caller to handle
      return NextResponse.json({ classification }, { status: 200 })
    }
  }

  if (body.amount === undefined || body.amount === null || body.amount === "") {
    return NextResponse.json({ error: "bidderId and amount are required." }, { status: 400 })
  }

  const result = await placeBid(auctionId, String(body.bidderId), String(body.amount))
  // emit("bid.placed") fires inside placeBid on success

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409
    return NextResponse.json({ error: REASON_MESSAGES[result.reason] }, { status })
  }

  return NextResponse.json(
    { auction: result.auction, bidder: result.bidder, outbid: result.outbid },
    { status: 200 }
  )
}
