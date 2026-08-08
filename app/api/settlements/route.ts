import { NextResponse } from "next/server"
import { getSettlements, createSettlement } from "@/lib/auction-store"

export async function GET() {
  const settlements = await getSettlements()
  return NextResponse.json(settlements)
}

// POST body: { auctionId, winner, amount, asset, wallet }
// emit("settlement.created") is called inside createSettlement
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.auctionId || !body.winner || !body.amount || !body.asset || !body.wallet) {
    return NextResponse.json(
      { error: "auctionId, winner, amount, asset, and wallet are required." },
      { status: 400 }
    )
  }
  const settlement = await createSettlement({
    auctionId: body.auctionId,
    winner: body.winner,
    amount: body.amount,
    asset: body.asset,
    wallet: body.wallet,
  })
  return NextResponse.json(settlement, { status: 201 })
}
