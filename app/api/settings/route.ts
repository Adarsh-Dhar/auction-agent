import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
import { apiError, readJson } from "@/lib/api-utils"
export function GET() { return NextResponse.json(auctionStore.settings) }
export async function PATCH(request: Request) { const patch = await readJson<Record<string, unknown>>(request); if (!patch) return apiError("Invalid settings"); const allowed = ["reserveProtection", "autoExtend", "humanApproval", "webChat", "email", "sms", "defaultEscalationSensitivity"]; for (const key of allowed) if (key in patch) (auctionStore.settings as Record<string, unknown>)[key] = patch[key]; emit("settings.updated", auctionStore.settings); return NextResponse.json(auctionStore.settings) }
