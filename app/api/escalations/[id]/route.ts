import { NextResponse } from "next/server"
import { resolveEscalation, reopenEscalation } from "@/lib/auction-store"

// PATCH body: { "status": "resolved" | "open" }
// emit("escalation.resolved") / emit("escalation.reopened") called inside store
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id
  const body = await request.json().catch(() => ({}))
  const item = body.status === "open"
    ? await reopenEscalation(id)
    : await resolveEscalation(id)
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ error: "Not found" }, { status: 404 })
}
