import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"

export async function GET(_: Request, { params }: { params: Promise<{ auctionId: string }> }) { const { auctionId } = await params; const auction = auctionStore.auctions.find((item) => item.id === auctionId); return auction ? NextResponse.json({ auction, bidders: auctionStore.bidders[auctionId] || [] }) : NextResponse.json({ error: "Auction not found" }, { status: 404 }) }
