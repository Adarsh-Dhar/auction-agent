import { NextResponse } from "next/server"
import { auctionStore } from "@/lib/auction-store"
export function GET() { return NextResponse.json(auctionStore.escalations) }
