import { describe, it, expect } from "vitest"
import { getConversationContext, getRecentMessages } from "@/lib/agent/memory"
import { createTestAuction, createTestBidder, createTestMessage } from "@/tests/helpers"

describe("getConversationContext", () => {
  it("returns empty array when bidder has no messages", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-empty" })
    const context = await getConversationContext("bd-empty")
    expect(context).toHaveLength(0)
  })

  it("returns messages in chronological order (oldest first)", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-mem" })
    // Insert with deliberate ordering via different `at` values
    await createTestMessage("bd-mem", "First message", "question")
    await createTestMessage("bd-mem", "Second message", "bid")
    await createTestMessage("bd-mem", "Third message", "system")
    const context = await getConversationContext("bd-mem", 6)
    expect(context).toHaveLength(3)
    expect(context[0].content).toContain("First message")
    expect(context[2].content).toContain("Third message")
  })

  it("respects the limit parameter", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-lim" })
    for (let i = 0; i < 8; i++) {
      await createTestMessage("bd-lim", `Message ${i}`, "question")
    }
    const context = await getConversationContext("bd-lim", 4)
    expect(context).toHaveLength(4)
  })

  it("assigns role=user for bidder messages", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-role" })
    const { prisma } = await import("@/lib/db")
    await prisma.message.create({
      data: { id: "m-user-test", bidderId: "bd-role", author: "Some Bidder", body: "Hi", kind: "question", at: "10:00:00" },
    })
    const context = await getConversationContext("bd-role")
    expect(context[0].role).toBe("user")
  })

  it("assigns role=assistant for agent and operator messages", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-asst" })
    const { prisma } = await import("@/lib/db")
    await prisma.message.create({
      data: { id: "m-asst-test", bidderId: "bd-asst", author: "Auction agent", body: "Got it", kind: "system", at: "10:00:01" },
    })
    const context = await getConversationContext("bd-asst")
    expect(context[0].role).toBe("assistant")
  })
})

describe("getRecentMessages", () => {
  it("returns Message objects rather than chat turns", async () => {
    await createTestAuction()
    await createTestBidder("AUC-TEST", { id: "bd-raw" })
    await createTestMessage("bd-raw", "Hello", "question")
    const messages = await getRecentMessages("bd-raw", 6)
    expect(messages).toHaveLength(1)
    const msg = messages[0]
    // Should have full Message shape
    expect(msg).toHaveProperty("id")
    expect(msg).toHaveProperty("bidderId")
    expect(msg).toHaveProperty("author")
    expect(msg).toHaveProperty("body")
    expect(msg).toHaveProperty("kind")
    expect(msg).toHaveProperty("at")
  })
})
