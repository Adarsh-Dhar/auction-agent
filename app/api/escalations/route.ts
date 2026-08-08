import { NextResponse } from "next/server"
import { getEscalations, createEscalation } from "@/lib/auction-store"
import { prisma } from "@/lib/db"

export async function GET() {
  const escalations = await getEscalations()
  return NextResponse.json(escalations)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.auctionId || !body.bidderId || !body.reason) {
    return NextResponse.json({ error: "auctionId, bidderId, and reason are required." }, { status: 400 })
  }

  // Resolve display name from the real bidder record
  const bidderRow = await prisma.bidder.findUnique({ where: { id: body.bidderId } })
  if (!bidderRow) {
    return NextResponse.json({ error: "Bidder not found." }, { status: 404 })
  }

  const escalation = await createEscalation({
    auctionId: body.auctionId,
    bidderId: body.bidderId,
    bidderName: bidderRow.name,
    reason: body.reason,
    severity: body.severity ?? "medium",
  })
  // emit("escalation.created") is called inside createEscalation
  return NextResponse.json(escalation, { status: 201 })
}
