import { NextResponse } from "next/server"
import { getEscalations, createEscalation } from "@/lib/auction-store"

export async function GET() {
  const escalations = await getEscalations()
  return NextResponse.json(escalations)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.auctionId || !body.bidder || !body.reason) {
    return NextResponse.json({ error: "auctionId, bidder, and reason are required." }, { status: 400 })
  }
  const escalation = await createEscalation({
    auctionId: body.auctionId,
    bidder: body.bidder,
    reason: body.reason,
    severity: body.severity ?? "medium",
  })
  // emit("escalation.created") is called inside createEscalation
  return NextResponse.json(escalation, { status: 201 })
}
