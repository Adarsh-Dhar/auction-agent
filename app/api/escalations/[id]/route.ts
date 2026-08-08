import { NextResponse } from "next/server"
import { resolveEscalation, reopenEscalation } from "@/lib/auction-store"

// PATCH body: { status: "resolved" | "open", note?: string }
// - "resolved": flips status, writes optional note as an agent message in the
//    bidder's thread, fires message.created + escalation.resolved over SSE.
//    Also triggers a fire-and-forget POST to /api/internal/notify-resolved so
//    channel services (email, etc.) can dispatch the note outbound.
// - "open":     reopens the escalation, no message dispatched.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id
  const body = await request.json().catch(() => ({}))
  const note: string | undefined = typeof body.note === "string" ? body.note : undefined

  if (body.status === "open") {
    const item = await reopenEscalation(id)
    return item
      ? NextResponse.json(item)
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const item = await resolveEscalation(id, note)
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Fire-and-forget: tell channel services to dispatch the note outbound.
  // The email service runs a local Flask webhook on EMAIL_WEBHOOK_PORT (default 3001).
  if (note?.trim() && item.bidderId) {
    const webhookUrl = `http://127.0.0.1:${process.env.EMAIL_WEBHOOK_PORT ?? "3001"}/notify-resolved`
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidderId: item.bidderId, note: note.trim() }),
    }).catch(() => {
      // Best-effort — the email service may not be running; never block the PATCH response
    })
  }

  return NextResponse.json(item)
}
