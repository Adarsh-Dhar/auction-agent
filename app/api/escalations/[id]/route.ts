import { NextResponse } from "next/server"
import { reopenEscalation, resolveEscalation } from "@/lib/auction-store"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const id = (await params).id; const body = await request.json().catch(() => ({})); const item = body.status === "open" ? reopenEscalation(id) : resolveEscalation(id); return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 }) }
