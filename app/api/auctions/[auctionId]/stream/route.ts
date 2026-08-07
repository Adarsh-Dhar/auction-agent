import { auctionStore } from "@/lib/auction-store"

export const dynamic = "force-dynamic"
export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      let cleanup = () => {}
      const send = (event: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }
      const handler = (event: unknown) => send(event)
      const heartbeat = setInterval(() => send({ type: "heartbeat", at: new Date().toISOString() }), 12000)
      const timer = setTimeout(() => send({ type: "presence.update", payload: { bidder: "Maya Chen", status: "active" }, at: new Date().toISOString() }), 4500)
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        clearTimeout(timer)
        auctionStore.events.off("auction", handler)
      }
      auctionStore.events.on("auction", handler)
      send({ type: "connected", at: new Date().toISOString() })
      send({ type: "stream.ready", at: new Date().toISOString() })
      return cleanup
    },
    cancel() {
      // The runtime closes the stream when the browser disconnects.
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } })
}
