import { NextResponse } from "next/server"
import { addMessage, auctionStore, emit, findBidder } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"
type Context = { params: Promise<{ bidderId: string }> }
export async function GET(_: Request, { params }: Context) { const { bidderId } = await params; if (!findBidder(bidderId)) return apiError("Bidder not found", 404); return NextResponse.json(auctionStore.messages[bidderId] || []) }
export async function POST(request: Request, { params }: Context) { const { bidderId } = await params; const bidder = findBidder(bidderId); const body = await readJson<Record<string, unknown>>(request); if (!bidder || body?.from !== "operator" || typeof body.body !== "string" || !body.body.trim()) return apiError("Operator body is required"); return NextResponse.json(addMessage(bidderId, body.body, { author: "Operator", kind: "system" }), { status: 201 }) }
