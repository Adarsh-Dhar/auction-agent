/**
 * Per-test-file setup.
 *
 * - Swaps DATABASE_URL to a throwaway SQLite file so tests never touch the
 *   real dev.db.
 * - Sets sentinel API keys so classify.ts takes the heuristic path
 *   (no real LLM calls in the test suite — mocked where needed).
 * - Truncates all tables before each individual test for isolation.
 *
 * Schema push (prisma db push --force-reset) used to happen here in a
 * beforeAll, but that ran once PER TEST FILE — and Vitest runs test files
 * in parallel by default, so multiple files were force-resetting the same
 * SQLite file concurrently ("database is locked"). It now runs exactly
 * once, before any test file starts, via tests/global-setup.ts.
 */
import { beforeEach, afterAll } from "vitest"

// Point to a separate test database
process.env.DATABASE_URL = "file:./test.db"
// Sentinel values — classify.ts checks for these and uses the heuristic fallback
process.env.OPENAI_API_KEY = "sk-your-openai-api-key-here"
process.env.GEMINI_API_KEY = "your-gemini-api-key-here"

beforeEach(async () => {
  // Import fresh to pick up the test DATABASE_URL
  const { prisma } = await import("@/lib/db")
  // Delete in dependency order (FK constraints)
  await prisma.eventLog.deleteMany()
  await prisma.message.deleteMany()
  await prisma.escalation.deleteMany()
  await prisma.settlement.deleteMany()
  await prisma.policyRule.deleteMany()
  await prisma.bidder.deleteMany()
  await prisma.auction.deleteMany()
  await prisma.settings.deleteMany()
})

afterAll(async () => {
  const { prisma } = await import("@/lib/db")
  await prisma.$disconnect()
})
