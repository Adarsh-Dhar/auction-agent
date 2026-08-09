/**
 * Shared test helpers — thin wrappers around the store that seed minimal
 * fixture data so individual test files don't repeat boilerplate.
 */
import { prisma } from "@/lib/db"

export const now = () => new Date().toISOString()

// ─── Calculation helpers ────────────────────────────────────────────────────────

/**
 * Calculate the default minimum bid increment as 1% of the floor price.
 * This mirrors the logic in lib/auction-store.ts for testing purposes.
 */
export function calculateTestMinIncrement(floor: string): string {
  const isNegative = floor.trim().startsWith("-")
  const cleaned = floor.replace(/[^0-9.]/g, "")
  const floorValue = cleaned ? Number.parseFloat(cleaned) : NaN
  if (Number.isNaN(floorValue) || floorValue <= 0 || isNegative) {
    return "$1" // Fallback to safe default for invalid/zero/negative floors
  }
  const increment = Math.round(floorValue * 0.01 * 100) / 100
  return `$${increment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

export async function createTestAuction(overrides: Partial<{
  id: string
  title: string
  status: string
  floor: string
  topBid: string
  terms: string
  joinCode: string
  endsAt: string | null
  minIncrement: string
  lastBidAt: string | null
  bidWindowSeconds: number
  extendSeconds: number
  autoExtend: boolean
}> = {}) {
  // Generate a unique join code per call to avoid unique-constraint collisions
  // when multiple tests run against the same in-process SQLite connection.
  const defaultCode = `T${Date.now().toString(36).slice(-4).toUpperCase()}X`
  return prisma.auction.create({
    data: {
      id: overrides.id ?? `AUC-${Date.now().toString(36).toUpperCase()}`,
      title: overrides.title ?? "Test Auction",
      status: overrides.status ?? "live",
      bidders: 0,
      topBid: overrides.topBid ?? "$0",
      floor: overrides.floor ?? "$100",
      endsAt: overrides.endsAt ?? new Date(Date.now() + 86_400_000).toISOString(),
      minIncrement: overrides.minIncrement ?? "$1", // Keep explicit default for test predictability
      createdAt: now(),
      terms: overrides.terms ?? "Standard test terms.",
      channels: JSON.stringify(["Web chat"]),
      autoExtend: overrides.autoExtend ?? true,
      requiresApproval: false,
      joinCode: overrides.joinCode ?? defaultCode,
      lastBidAt: overrides.lastBidAt,
      bidWindowSeconds: overrides.bidWindowSeconds ?? 300,
      extendSeconds: overrides.extendSeconds ?? 60,
    },
  })
}

export async function createTestBidder(auctionId: string, overrides: Partial<{
  id: string
  name: string
  handle: string
  lastBid: string
  email: string
}> = {}) {
  return prisma.bidder.create({
    data: {
      id: overrides.id ?? `bd-${Date.now()}`,
      auctionId,
      name: overrides.name ?? "Test Bidder",
      handle: overrides.handle ?? "test.bidder",
      status: "active",
      lastBid: overrides.lastBid ?? "—",
      connection: "Web chat",
      email: overrides.email,
    },
  })
}

export async function createTestMessage(bidderId: string, body: string, kind = "system") {
  return prisma.message.create({
    data: {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      bidderId,
      author: "Test Bidder",
      body,
      kind,
      at: new Date().toLocaleTimeString(),
    },
  })
}

// ─── Request helpers ──────────────────────────────────────────────────────────

/** Build a minimal Next.js Request object for route handler testing. */
export function makeRequest(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Request {
  return new Request(`http://localhost:3000${url}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
}

/** Extract JSON from a Next.js Response. */
export async function json<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}
