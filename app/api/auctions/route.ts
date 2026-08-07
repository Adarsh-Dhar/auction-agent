import { NextResponse } from "next/server"
import { auctionStore, createAuction } from "@/lib/auction-store"

export function GET() { return NextResponse.json(auctionStore.auctions) }
export async function POST(request: Request) { const body = await request.json(); return NextResponse.json(createAuction(body), { status: 201 }) }
