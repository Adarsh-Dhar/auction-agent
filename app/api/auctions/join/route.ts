import { NextResponse } from "next/server"
import { joinAuctionByCode, parseJoinCommand } from "@/lib/auction-store"

/**
 * POST /api/auctions/join
 *
 * Accepts either:
 *   { code, name, handle, connection?, address? }
 *   { message: "/join K7P2QX", name, handle, connection?, address? }
 *
 * emit("bidder.joined") is called inside joinAuctionByCode on success.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const code = body.code ? String(body.code) : parseJoinCommand(String(body.message || ""))

  if (!code) {
    return NextResponse.json(
      { error: 'Send a room code, e.g. { "code": "K7P2QX" } or { "message": "/join K7P2QX" }.' },
      { status: 400 }
    )
  }
  if (!body.name || !body.handle) {
    return NextResponse.json({ error: "name and handle are required." }, { status: 400 })
  }

  const result = await joinAuctionByCode(code, {
    name: String(body.name),
    handle: String(body.handle),
    connection: String(body.connection || "Web chat"),
    email: body.address ? String(body.address) : undefined,
  })

  if (!result.ok) {
    const message =
      result.reason === "invalid_code"
        ? "That code doesn't match any auction. Double-check it with the seller."
        : "This auction is closed and no longer accepting bidders."
    return NextResponse.json({ error: message }, { status: result.reason === "invalid_code" ? 404 : 409 })
  }

  return NextResponse.json({ auction: result.auction, bidder: result.bidder }, { status: 201 })
}
