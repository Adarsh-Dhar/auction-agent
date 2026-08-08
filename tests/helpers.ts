/**
 * Shared test helpers — thin wrappers around the store that seed minimal
 * fixture data so individual test files don't repeat boilerplate.
 */
import { prisma } from "@/lib/db"

export const now = () => new Date().toISOString()

// ─── Fixtures ────────────────────────────────────────────────────────────────

export async function createTestAuction(overrides: Partial<{
  id: string
  title: string
  status: string
  floor: string
  topBid: string
  terms: string
  joinCode: string
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
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdAt: now(),
      terms: overrides.terms ?? "Standard test terms.",
      channels: JSON.stringify(["Web chat"]),
      autoExtend: true,
      requiresApproval: false,
      joinCode: overrides.joinCode ?? defaultCode,
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
