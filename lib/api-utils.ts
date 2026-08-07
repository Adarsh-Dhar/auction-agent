import { NextResponse } from "next/server"

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try { return await request.json() as T } catch { return null }
}

export function numericValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

export function inviteToken() { return crypto.randomUUID().replaceAll("-", "") }
