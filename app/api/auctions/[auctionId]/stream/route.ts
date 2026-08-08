import { auctionStore } from "@/lib/auction-store"

export const dynamic = "force-dynamic"

/**
 * SSE stream for a single auction room.
 * Listens on the global EventEmitter — every emit() call in the store
 * (bid.placed, message.created, escalation.*, settlement.*, auction.created,
 * bidder.joined, settings.updated, policy.*) reaches all connected clients.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  // We receive the auctionId so we could filter per-auction in the future,
  // but for now we forward all events so mission control stays fully live.
  await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const send = (event: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }

      const handler = (event: unknown) => send(event)

      // Heartbeat every 12 s to keep the connection alive through proxies
      const heartbeat = setInterval(
        () => send({ type: "heartbeat", at: new Date().toISOString() }),
        12_000
      )

      auctionStore.events.on("auction", handler)

      send({ type: "connected", at: new Date().toISOString() })
      send({ type: "stream.ready", at: new Date().toISOString() })

      return () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        auctionStore.events.off("auction", handler)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
