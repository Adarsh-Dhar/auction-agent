import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
export function GET() { return NextResponse.json(["telegram", "whatsapp", "email"].map((type) => auctionStore.channels[type] || { type, connected: false })) }
