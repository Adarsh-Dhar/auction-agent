import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"
type Context = { params: Promise<{ type: string }> }
export async function POST(request: Request, { params }: Context) { const { type } = await params; const body = await readJson<Record<string, unknown>>(request); if (!["telegram", "whatsapp", "email"].includes(type)) return apiError("Unsupported channel", 404); auctionStore.channels[type] = { type, connected: true, lastMessageReceived: undefined }; emit("channel.connected", { type }); return NextResponse.json({ type, connected: true, configured: Boolean(body) }, { status: 201 }) }
