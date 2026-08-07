import { NextResponse } from "next/server"
import { auctionStore, emit, findAuction, Policy } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"

type Context = { params: Promise<{ auctionId: string }> }
const fallback: Policy = { revealFloor: false, revealLeader: false, revealBidCount: false, rounding: "none", allowedConditions: [], escalationSensitivity: "med" }
export async function GET(_: Request, { params }: Context) { const { auctionId } = await params; if (!findAuction(auctionId)) return apiError("Auction not found", 404); return NextResponse.json(auctionStore.policies[auctionId] || fallback) }
export async function PATCH(request: Request, { params }: Context) { const { auctionId } = await params; if (!findAuction(auctionId)) return apiError("Auction not found", 404); const body = await readJson<Partial<Policy>>(request); if (!body) return apiError("Invalid policy"); const current = auctionStore.policies[auctionId] || fallback; const next = { ...current, ...body, allowedConditions: body.allowedConditions || current.allowedConditions }; if (!["none", "5", "10"].includes(next.rounding)) return apiError("Invalid rounding"); auctionStore.policies[auctionId] = next; emit("policy.updated", { previous: current, next }, auctionId); return NextResponse.json(next) }
