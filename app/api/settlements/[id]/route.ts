import { NextResponse } from "next/server"
import { getSettlement, updateSettlement } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"
type Context = { params: Promise<{ id: string }> }
export async function GET(_: Request, { params }: Context) { const settlement = getSettlement((await params).id); return settlement ? NextResponse.json(settlement) : apiError("Settlement not found", 404) }
export async function POST(request: Request, { params }: Context) { const id = (await params).id; const body = await readJson<Record<string, unknown>>(request); const settlement = getSettlement(id); if (!settlement) return apiError("Settlement not found", 404); if (!["verify", "confirm", "retry"].includes(String(body?.action))) return apiError("Unknown settlement action"); if (body?.action === "confirm" && settlement.status !== "verifying") return apiError("Settlement must pass verification before confirmation", 409); const status = body?.action === "verify" ? "verifying" : body?.action === "confirm" ? "confirmed" : "pending"; return NextResponse.json(updateSettlement(id, status)!) }
