import { NextResponse } from "next/server"
import { addMessage, emit, resolveEscalation } from "@/lib/auction-store"
import { notifyBidder } from "@/lib/agent/notify"
import { apiError, readJson } from "@/lib/api-utils"
type Context = { params: Promise<{ id: string }> }
export async function PATCH(request: Request, { params }: Context) { const { id } = await params; const body = await readJson<Record<string, unknown>>(request); const status = body?.status === "open" ? "open" : body?.status === "resolved" ? "resolved" : null; if (!status) return apiError("status must be resolved or open"); const item = resolveEscalation(id, status, typeof body?.resolution === "string" ? body.resolution : undefined); if (!item) return apiError("Escalation not found", 404); let delivery: unknown = undefined; if (status === "resolved" && item.bidderId && typeof body?.resolution === "string") { addMessage(item.bidderId, body.resolution, { author: "Auction agent", kind: "system" }); delivery = await notifyBidder(item.bidderId, body.resolution) } emit("escalation.feedback", item, item.auctionId); return NextResponse.json({ ...item, delivery }) }
