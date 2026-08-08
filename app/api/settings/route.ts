import { NextResponse } from "next/server"
import { getSettings, updateSettings } from "@/lib/auction-store"

export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

// PATCH body: Partial<Settings> — any subset of boolean flags
// emit("settings.updated") is called inside updateSettings
export async function PATCH(request: Request) {
  const patch = await request.json().catch(() => ({}))
  const settings = await updateSettings(patch)
  return NextResponse.json(settings)
}
