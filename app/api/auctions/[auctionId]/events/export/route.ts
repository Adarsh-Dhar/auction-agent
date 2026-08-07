import { auctionStore } from "@/lib/auction-store"
type Context = { params: Promise<{ auctionId: string }> }
function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"` }
export async function GET(_: Request, { params }: Context) { const { auctionId } = await params; const rows = auctionStore.audit.filter((event) => event.auctionId === auctionId); const body = ["id,type,at,payload", ...rows.map((event) => [event.id, event.type, event.at, JSON.stringify(event.payload)].map(csv).join(","))].join("\n"); return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${auctionId}-events.csv` } }) }
