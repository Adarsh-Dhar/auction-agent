import { NextResponse } from "next/server"
import { placeBid } from "@/lib/auction-store"

const REASON_MESSAGES: Record<string, string> = {
  not_found: "Auction or bidder not found.",
  auction_closed: "This auction is closed and no longer accepting bids.",
  invalid_amount: "That doesn't look like a valid bid amount.",
  below_floor: "That bid is below the reserve floor.",
  below_top_bid: "That bid doesn't beat the current top bid.",
}

// Places a bid for a bidder who has already joined this auction.
// Body: { bidderId: string, amount: string | number }
export async function POST(request: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params
  const body = await request.json().catch(() => ({}))

  if (!body.bidderId || body.amount === undefined || body.amount === null || body.amount === "") {
    return NextResponse.json({ error: "bidderId and amount are required." }, { status: 400 })
  }

  const result = placeBid(auctionId, String(body.bidderId), String(body.amount))

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409
    return NextResponse.json({ error: REASON_MESSAGES[result.reason] }, { status })
  }

  return NextResponse.json({ auction: result.auction, bidder: result.bidder, outbid: result.outbid }, { status: 200 })
}
