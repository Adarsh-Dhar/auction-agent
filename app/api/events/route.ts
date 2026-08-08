import { NextResponse } from "next/server"
import { getEventLog } from "@/lib/auction-store"

/**
 * GET /api/events                      — last 200 events across all auctions
 * GET /api/events?auctionId=AUC-1048  — last 200 events for a specific auction
 *
 * Events are written by logEvent() which is called from emit() on every
 * mutation: bid.placed, message.created, escalation.*, settlement.*,
 * auction.created, bidder.joined, settings.updated, policy.*
 */
export async function GET(request: Request) {
  const auctionId = new URL(request.url).searchParams.get("auctionId") ?? undefined
  const events = await getEventLog(auctionId)
  return NextResponse.json(events)
}
