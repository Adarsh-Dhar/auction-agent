import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
type Context = { params: Promise<{ type: string }> }
export async function POST(_: Request, { params }: Context) { const { type } = await params; auctionStore.channels[type] = { type, connected: false }; emit("channel.disconnected", { type }); return NextResponse.json({ type, connected: false }) }
