import { listenForMessages, connectEmail } from "../lib/caspian"
import { handleInboundMessage } from "../lib/agent/handle-message"

async function main() {
  const connection = await connectEmail("auction-agent")
  console.log(`[auction-agent] listening on ${connection.address}`)
  const stream = await listenForMessages()
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() || ""
    for (const frame of frames) {
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("")
      if (!data) continue
      try { await handleInboundMessage(JSON.parse(data)) } catch (error) { console.error("[auction-agent] message handling failed", error) }
    }
  }
}
main().catch((error) => { console.error("[auction-agent] worker stopped", error); process.exitCode = 1 })
