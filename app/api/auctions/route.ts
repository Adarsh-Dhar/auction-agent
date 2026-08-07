import { NextResponse } from "next/server"
import { createAuction, auctionStore } from "@/lib/auction-store"
import { apiError, numericValue, readJson } from "@/lib/api-utils"

export function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const sort = searchParams.get("sort")
  if (status && !["live", "draft", "closed", "paused", "settled"].includes(status)) return apiError("Invalid status filter")
  const items = auctionStore.auctions.filter((auction) => !status || auction.status === status).map(({ id, title, status, floor, topBid, bidders, endsAt }) => ({ id, title, status, floor, topBid, bidderCount: bidders, bidders, endsAt }))
  if (sort === "ending") items.sort((a, b) => a.endsAt.localeCompare(b.endsAt))
  if (sort === "topBid") items.sort((a, b) => numericValue(b.topBid)! - numericValue(a.topBid)!)
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request)
  if (!body || typeof body.title !== "string" || !Array.isArray(body.channels)) return apiError("title and channels are required")
  const floor = numericValue(body.floor)
  const deadline = new Date(String(body.deadline || body.endsAt || ""))
  if (!floor || floor <= 0) return apiError("floor must be greater than zero")
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) return apiError("deadline must be in the future")
  const policy = body.policy && typeof body.policy === "object" ? body.policy : undefined
  const auction = createAuction({ status: "draft", title: body.title, description: typeof body.description === "string" ? body.description : "", images: Array.isArray(body.images) ? body.images.map(String) : [], floor: `$${floor.toLocaleString()}`, minIncrement: String(body.minIncrement || ""), terms: String(body.terms || ""), endsAt: deadline.toISOString(), channels: body.channels.map(String), autoExtend: Boolean((policy as Record<string, unknown> | undefined)?.autoExtend), requiresApproval: Boolean((policy as Record<string, unknown> | undefined)?.requiresApproval), allowedConditions: Array.isArray(body.allowedConditions) ? body.allowedConditions.map(String) : [], policy: policy as never })
  return NextResponse.json(auction, { status: 201 })
}
