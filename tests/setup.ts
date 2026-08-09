/**
 * Global test setup.
 *
 * - Swaps DATABASE_URL to a throwaway in-memory SQLite URL so tests never
 *   touch the real dev.db.
 * - Sets sentinel API keys so classify.ts takes the heuristic path
 *   (no real LLM calls in the test suite — mocked where needed).
 * - Runs prisma migrate deploy on the test database before all suites.
 * - Truncates all tables before each individual test for isolation.
 */
import { beforeAll, beforeEach, afterAll } from "vitest"
import { execSync } from "child_process"
import path from "path"

// Point to a separate test database
process.env.DATABASE_URL = "file:./test.db"
// Sentinel values — classify.ts checks for these and uses the heuristic fallback
process.env.OPENAI_API_KEY = "sk-your-openai-api-key-here"
process.env.GEMINI_API_KEY = "your-gemini-api-key-here"

beforeAll(async () => {
  // Push the schema to the test DB (fast — no migration history needed for tests)
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  })
})

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
