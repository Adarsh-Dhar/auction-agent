-- Migration: add per-round bid timer fields to Auction + ReminderSent dedup table
--
-- lastBidAt/bidWindowSeconds/extendSeconds are plain ADD COLUMN — no FK
-- involved, so (unlike the earlier Escalation migration) we don't need the
-- rename/recreate dance here.

ALTER TABLE "Auction" ADD COLUMN "lastBidAt" TEXT;
ALTER TABLE "Auction" ADD COLUMN "bidWindowSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "Auction" ADD COLUMN "extendSeconds" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "ReminderSent" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "cycleKey"  TEXT NOT NULL,
    "tier"      TEXT NOT NULL,
    "sentAt"    TEXT NOT NULL
);

CREATE UNIQUE INDEX "ReminderSent_auctionId_cycleKey_tier_key"
    ON "ReminderSent" ("auctionId", "cycleKey", "tier");
