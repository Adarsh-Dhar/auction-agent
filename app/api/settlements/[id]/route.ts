import { NextResponse } from "next/server"
import { getSettlement, updateSettlement } from "@/lib/auction-store"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const settlement = getSettlement((await params).id)
  return settlement ? NextResponse.json(settlement) : NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const body = await request.json().catch(() => ({}))
  const status = body.action === "verify" ? "verifying" : body.action === "confirm" ? "confirmed" : body.action === "retry" ? "pending" : undefined
  if (!status) return NextResponse.json({ error: "Unknown settlement action" }, { status: 400 })
  const settlement = updateSettlement(id, status)
  return settlement ? NextResponse.json(settlement) : NextResponse.json({ error: "Not found" }, { status: 404 })
}
