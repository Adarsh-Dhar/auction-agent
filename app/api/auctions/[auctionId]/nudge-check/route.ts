import { NextResponse } from "next/server"
import { addMessage, auctionStore, findAuction } from "@/lib/auction-store"
import { apiError } from "@/lib/api-utils"
type Context = { params: Promise<{ auctionId: string }> }
export async function POST(_: Request, { params }: Context) { const { auctionId } = await params; const auction = findAuction(auctionId); if (!auction) return apiError("Auction not found", 404); const cutoff = Date.now() - 24 * 60 * 60 * 1000; const nudged = (auctionStore.bidders[auctionId] || []).filter((bidder) => bidder.status === "quiet" && new Date(bidder.lastActiveAt || 0).getTime() < cutoff).map((bidder) => addMessage(bidder.id, `The ${auction.title} auction is nearing its deadline. Would you like to stay in the running?`, { author: "Auction agent", kind: "system" })); return NextResponse.json({ auctionId, nudged: nudged.length, messages: nudged }) }
