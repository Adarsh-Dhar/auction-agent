import { NextResponse } from "next/server"
import { findBidderById } from "@/lib/auction-store"

/**
 * POST /api/internal/notify-resolved
 *
 * Called by the email service (or any channel layer) after an escalation is
 * resolved. Returns the bidder's channel info so the caller can decide
 * whether and how to send an outbound notification.
 *
 * Body: { bidderId: string, note: string }
 *
 * Response: { bidder: { id, name, connection, email }, note: string }
 *
 * This endpoint does NOT send the message itself — the channel-specific
 * service (email-service/handler.py, etc.) reads the response and dispatches
 * via its own SDK. This keeps the Next.js server free of outbound SMTP/HTTP
 * calls and lets each channel service own its send path.
 *
 * The email service should poll for pending notifications, or be called via
 * a fire-and-forget fetch from the PATCH route after resolveEscalation().
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { bidderId, note } = body as { bidderId?: string; note?: string }

  if (!bidderId || !note?.trim()) {
    return NextResponse.json(
      { error: "bidderId and note are required." },
      { status: 400 }
    )
  }

  const bidder = await findBidderById(bidderId)
  if (!bidder) {
    return NextResponse.json({ error: "Bidder not found." }, { status: 404 })
  }

  // Return channel info — the caller dispatches on its own
  return NextResponse.json({
    bidder: {
      id: bidder.id,
      name: bidder.name,
      connection: bidder.connection,
      email: bidder.email ?? null,
    },
    note: note.trim(),
  })
}
