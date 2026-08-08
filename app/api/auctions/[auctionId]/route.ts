import { NextResponse } from "next/server"
import { getAuction, getBiddersForAuction, rotateJoinCode } from "@/lib/auction-store"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  const { auctionId } = await params
  const [auction, bidders] = await Promise.all([
    getAuction(auctionId),
    getBiddersForAuction(auctionId),
  ])
  if (!auction) return NextResponse.json({ error: "Auction not found" }, { status: 404 })
  return NextResponse.json({ auction, bidders })
}

// PATCH body: { "action": "rotateCode" }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  const { auctionId } = await params
  const body = await request.json().catch(() => ({}))
  if (body.action !== "rotateCode") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
  const auction = await rotateJoinCode(auctionId)
  return auction
    ? NextResponse.json({ auction })
    : NextResponse.json({ error: "Auction not found" }, { status: 404 })
}
