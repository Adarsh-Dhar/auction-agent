import { NextResponse } from "next/server"
import { createAuction, getAuctions } from "@/lib/auction-store"

export async function GET() {
  const auctions = await getAuctions()
  return NextResponse.json(auctions)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.title || !body.floor || !body.status || !body.endsAt) {
    return NextResponse.json({ error: "title, floor, status, and endsAt are required." }, { status: 400 })
  }
  const auction = await createAuction({
    title: body.title,
    floor: body.floor,
    status: body.status,
    endsAt: body.endsAt,
    terms: body.terms ?? "",
    channels: Array.isArray(body.channels) ? body.channels : ["Web chat"],
    autoExtend: body.autoExtend ?? true,
    requiresApproval: body.requiresApproval ?? false,
  })
  return NextResponse.json(auction, { status: 201 })
}
