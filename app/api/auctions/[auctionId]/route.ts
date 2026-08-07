import { NextResponse } from "next/server"
import { auctionStore, rotateJoinCode } from "@/lib/auction-store"

export async function GET(_: Request, { params }: { params: Promise<{ auctionId: string }> }) { const { auctionId } = await params; const auction = auctionStore.auctions.find((item) => item.id === auctionId); return auction ? NextResponse.json({ auction, bidders: auctionStore.bidders[auctionId] || [] }) : NextResponse.json({ error: "Auction not found" }, { status: 404 }) }

// Regenerate the room code, e.g. { "action": "rotateCode" } if the seller thinks it leaked.
export async function PATCH(request: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params
  const body = await request.json().catch(() => ({}))
  if (body.action !== "rotateCode") return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  const auction = rotateJoinCode(auctionId)
  return auction ? NextResponse.json({ auction }) : NextResponse.json({ error: "Auction not found" }, { status: 404 })
}
