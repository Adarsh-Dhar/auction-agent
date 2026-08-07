import { NextResponse } from "next/server"
import { auctionStore, emit } from "@/lib/auction-store"
export function GET() { return NextResponse.json(auctionStore.settings) }
export async function PATCH(request: Request) { const patch = await request.json(); Object.assign(auctionStore.settings, patch); emit("settings.updated", auctionStore.settings); return NextResponse.json(auctionStore.settings) }
