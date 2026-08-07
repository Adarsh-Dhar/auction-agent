import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
type Context = { params: Promise<{ auctionId: string }> }
export async function GET(_: Request, { params }: Context) { const { auctionId } = await params; return NextResponse.json(auctionStore.escalations.filter((item) => item.auctionId === auctionId)) }
