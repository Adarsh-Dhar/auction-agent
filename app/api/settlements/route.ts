import { NextResponse } from "next/server"
import { auctionStore, createSettlement, updateSettlement } from "@/lib/auction-store"
export function GET() { return NextResponse.json(auctionStore.settlements) }
export async function POST(request: Request) { const body = await request.json(); return NextResponse.json(createSettlement(body), { status: 201 }) }
export async function PATCH(request: Request) { const body = await request.json(); const item = updateSettlement(body.id, body.status); return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 }) }
