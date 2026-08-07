import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"
import { CaspianError, connectEmail } from "@/lib/caspian"
type Context = { params: Promise<{ type: string }> }
export async function POST(request: Request, { params }: Context) {
  const { type } = await params
  if (type !== "email") return apiError("Only email is currently live through Caspian")
  const body = await readJson<Record<string, unknown>>(request)
  try {
    const connection = await connectEmail(typeof body?.username === "string" ? body.username : "auction-agent")
    auctionStore.channels.email = { type, connected: true, lastMessageReceived: undefined }
    emit("channel.connected", connection)
    return NextResponse.json({ ...connection, type, connected: true }, { status: 201 })
  } catch (error) {
    if (error instanceof CaspianError) return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
    return apiError("Unable to connect email")
  }
}
