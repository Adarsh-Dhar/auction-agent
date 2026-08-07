import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
type Context = { params: Promise<{ auctionId: string }> }
export async function GET(request: Request, { params }: Context) { const { auctionId } = await params; const { searchParams } = new URL(request.url); return NextResponse.json(auctionStore.audit.filter((event) => event.auctionId === auctionId && (!searchParams.get("type") || event.type === searchParams.get("type")) && (!searchParams.get("from") || event.at >= searchParams.get("from")!) && (!searchParams.get("to") || event.at <= searchParams.get("to")!)).sort((a, b) => a.at.localeCompare(b.at))) }
