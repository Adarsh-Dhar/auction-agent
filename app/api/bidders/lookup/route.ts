import { NextResponse } from "next/server"
import { findBidderByEmail } from "@/lib/auction-store"

// GET /api/bidders/lookup?email=someone@example.com
// Used by the email channel to route a reply to the right auction.
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "email query param is required." }, { status: 400 })
  }
  const found = await findBidderByEmail(email)
  if (!found) {
    return NextResponse.json({ error: "No auction found for this email." }, { status: 404 })
  }
  return NextResponse.json(found)
}
