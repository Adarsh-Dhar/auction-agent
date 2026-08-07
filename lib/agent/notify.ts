import { findBidder } from "@/lib/auction-store"
import { sendMessage, type CaspianMessage } from "@/lib/caspian"
export async function notifyBidder(bidderId: string, body: string) {
  const bidder = findBidder(bidderId)
  if (!bidder?.caspianConversationId && !bidder?.caspianConnectionId) return { delivered: false, reason: "bidder_not_connected" }
  const payload: CaspianMessage = { body, conversationId: bidder.caspianConversationId, connectionId: bidder.caspianConnectionId, channel: bidder.caspianChannel }
  try { return await sendMessage(payload) } catch (error) { return { delivered: false, reason: error instanceof Error ? error.message : "delivery_failed" } }
}
