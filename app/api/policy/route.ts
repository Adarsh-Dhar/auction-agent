import { NextResponse } from "next/server"
import { getPolicyRules, createPolicyRule, updatePolicyRule, deletePolicyRule } from "@/lib/auction-store"

/**
 * GET  /api/policy?auctionId=AUC-1048   — list rules (global + auction-specific)
 * GET  /api/policy                       — list all global rules
 * POST /api/policy                       — create a new rule
 */
export async function GET(request: Request) {
  const auctionId = new URL(request.url).searchParams.get("auctionId") ?? undefined
  const rules = await getPolicyRules(auctionId)
  return NextResponse.json(rules)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.name || !body.condition || !body.action) {
    return NextResponse.json({ error: "name, condition, and action are required." }, { status: 400 })
  }
  const rule = await createPolicyRule({
    auctionId: body.auctionId ?? undefined,
    name: body.name,
    description: body.description ?? "",
    condition: body.condition,
    action: body.action,
  })
  // emit("policy.created") fires inside createPolicyRule
  return NextResponse.json(rule, { status: 201 })
}

/**
 * PATCH /api/policy  body: { id, ...fields }
 */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 })
  const { id, ...patch } = body
  const rule = await updatePolicyRule(id, patch)
  // emit("policy.updated") fires inside updatePolicyRule
  return rule ? NextResponse.json(rule) : NextResponse.json({ error: "Not found" }, { status: 404 })
}

/**
 * DELETE /api/policy?id=pol-1  — soft-deletes (sets active: false)
 */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required." }, { status: 400 })
  const rule = await deletePolicyRule(id)
  // emit("policy.deleted") fires inside deletePolicyRule
  return rule ? NextResponse.json(rule) : NextResponse.json({ error: "Not found" }, { status: 404 })
}
