import { NextResponse } from "next/server"
import { getSettlement, updateSettlement } from "@/lib/auction-store"
type Context = { params: Promise<{ id: string }> }
export async function GET(_: Request, { params }: Context) { const id = (await params).id; const settlement = getSettlement(id); if (!settlement) return NextResponse.json({ error: "Settlement not found" }, { status: 404 }); return NextResponse.json(updateSettlement(id, "verifying")) }
