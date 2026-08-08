import { NextResponse } from "next/server"
import { getSettlement, updateSettlement } from "@/lib/auction-store"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const settlement = await getSettlement((await params).id)
  return settlement
    ? NextResponse.json(settlement)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}

// POST body: { "action": "verify" | "confirm" | "retry" }
// emit("settlement.<status>") is called inside updateSettlement
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id
  const body = await request.json().catch(() => ({}))
  const statusMap: Record<string, "verifying" | "confirmed" | "pending" | "failed"> = {
    verify: "verifying",
    confirm: "confirmed",
    retry: "pending",
    fail: "failed",
  }
  const status = statusMap[body.action]
  if (!status) return NextResponse.json({ error: "Unknown settlement action" }, { status: 400 })
  const settlement = await updateSettlement(id, status)
  return settlement
    ? NextResponse.json(settlement)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}
