import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
import { isCaspianConfigured, listLiveChannels } from "@/lib/caspian"
export async function GET() {
  if (isCaspianConfigured()) {
    try { return NextResponse.json(await listLiveChannels()) } catch { /* fall back to local state */ }
  }
  return NextResponse.json(["email"].map((type) => auctionStore.channels[type] || { type, connected: false, live: true, configured: false }))
}
