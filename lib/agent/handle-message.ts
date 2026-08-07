import { addMessage, auctionStore, createBidder, createEscalation, emit, findAuctionByCode, findBidderByConversation } from "@/lib/auction-store"
import { classifyMessage } from "./classify"
import { formatCents } from "./money"
import { sendMessage, type CaspianMessage } from "@/lib/caspian"

export async function handleInboundMessage(input: CaspianMessage) {
  const text = input.body.trim()
  let bidder = input.conversationId ? findBidderByConversation(input.conversationId) : undefined
  const auction = bidder?.auctionId ? auctionStore.auctions.find((entry) => entry.id === bidder?.auctionId) : findAuctionByCode(text)
  if (!bidder && auction) bidder = createBidder(auction.id, { name: input.from || "Email bidder", handle: input.from || "email", caspianConversationId: input.conversationId, caspianConnectionId: input.connectionId, caspianChannel: input.channel || "email" })
  if (!bidder) return { handled: false, reason: "auction_or_bidder_not_found" }
  const result = classifyMessage(text)
  addMessage(bidder.id, text, { author: bidder.name, kind: result.kind, classification: result.kind, decision: result.decision, amount: result.amountCents ? formatCents(result.amountCents) : undefined, condition: result.condition })
  if (result.amountCents && auction) { auction.topBidCents = Math.max(auction.topBidCents || 0, result.amountCents); auction.topBid = formatCents(auction.topBidCents); emit("bid.received", { bidderId: bidder.id, amountCents: result.amountCents }, auction.id) }
  if (result.decision === "escalate" && auction) createEscalation({ auctionId: auction.id, bidderId: bidder.id, bidder: bidder.name, reason: result.condition || `Agent flagged ${result.kind}`, severity: result.kind === "probe" ? "high" : "medium" })
  const response = result.kind === "probe" ? "I can share the published auction terms, but not private bidding information. I’ve sent this to the auction team." : result.kind === "question" ? auction?.terms || "I’ll have the auction team confirm the published terms." : result.decision === "escalate" ? "I’ve sent this to the auction team for review." : result.amountCents ? `Your bid of ${formatCents(result.amountCents)} has been received.` : "Thanks — I’ve recorded your message."
  addMessage(bidder.id, response, { author: "Auction agent", kind: "system" })
  try { await sendMessage({ body: response, conversationId: input.conversationId, connectionId: input.connectionId, channel: input.channel }) } catch { /* local state remains authoritative when gateway is unavailable */ }
  return { handled: true, bidderId: bidder.id, classification: result, response }
}
