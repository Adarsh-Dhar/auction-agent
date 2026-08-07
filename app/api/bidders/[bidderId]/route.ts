import { NextResponse } from "next/server"
import { addMessage, auctionStore } from "@/lib/auction-store"

export function GET(_: Request, { params }: { params: Promise<{ bidderId: string }> }) { return params.then(({ bidderId }) => NextResponse.json({ bidder: Object.values(auctionStore.bidders).flat().find((item) => item.id === bidderId), messages: auctionStore.messages[bidderId] || [] })) }
export async function POST(request: Request, { params }: { params: Promise<{ bidderId: string }> }) { const { bidderId } = await params; const { body } = await request.json(); return NextResponse.json(addMessage(bidderId, body), { status: 201 }) }
