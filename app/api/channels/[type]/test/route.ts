import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
import { CaspianError, testEmail } from "@/lib/caspian"
type Context = { params: Promise<{ type: string }> }
export async function POST(_: Request, { params }: Context) {
  const { type } = await params
  const channel = auctionStore.channels[type]
  if (!channel?.connected) return NextResponse.json({ error: "Channel is not connected" }, { status: 409 })
  if (type !== "email") return NextResponse.json({ type, delivered: false, note: "This channel requires a real inbound message to verify." })
  try { const result = await testEmail(); emit("channel.tested", { type, result }); return NextResponse.json({ type, ...result, at: new Date().toISOString() }) }
  catch (error) { if (error instanceof CaspianError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status }); return NextResponse.json({ error: "Email test failed" }, { status: 502 }) }
}
