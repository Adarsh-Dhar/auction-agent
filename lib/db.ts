/**
 * Singleton PrismaClient for Next.js.
 *
 * Next.js hot-reload creates new module instances in development, which would
 * exhaust the SQLite connection pool if we created a new PrismaClient on every
 * reload. The global trick keeps a single instance alive across hot reloads.
 */
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
