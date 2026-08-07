import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
type Context = { params: Promise<{ type: string }> }
export async function POST(_: Request, { params }: Context) { const { type } = await params; const channel = auctionStore.channels[type]; if (!channel?.connected) return NextResponse.json({ error: "Channel is not connected" }, { status: 409 }); emit("channel.tested", { type }); return NextResponse.json({ type, delivered: true, at: new Date().toISOString() }) }
