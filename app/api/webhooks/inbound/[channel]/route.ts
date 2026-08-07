import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
import { handleInboundMessage } from "@/lib/agent/handle-message"
import { apiError, readJson } from "@/lib/api-utils"
type Context = { params: Promise<{ channel: string }> }
export async function POST(request: Request, { params }: Context) { const { channel } = await params; if (channel !== "email") return apiError("Only email is currently live through Caspian"); const body = await readJson<Record<string, unknown>>(request); if (typeof body?.body !== "string") return apiError("body is required"); const result = await handleInboundMessage({ channel, body: body.body, from: typeof body.from === "string" ? body.from : undefined, conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined, connectionId: typeof body.connectionId === "string" ? body.connectionId : undefined }); auctionStore.channels.email = { ...(auctionStore.channels.email || { type: "email" }), type: "email", connected: true, lastMessageReceived: new Date().toISOString() }; return NextResponse.json(result, { status: result.handled ? 201 : 404 }) }
