import { NextResponse } from "next/server"
import { findBidderByEmail } from "@/lib/auction-store"

// GET /api/bidders/lookup?email=someone@example.com
// Used by the email channel to figure out which auction a reply belongs to,
// without asking the bidder to repeat their room code on every message.
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "email query param is required." }, { status: 400 })
  }
  const found = findBidderByEmail(email)
  if (!found) {
    return NextResponse.json({ error: "No auction found for this email." }, { status: 404 })
  }
  return NextResponse.json(found)
}
