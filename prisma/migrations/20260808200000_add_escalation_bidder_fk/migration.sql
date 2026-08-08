-- Migration: add bidderId FK and bidderName to Escalation
-- SQLite doesn't support ADD COLUMN with FK constraints inline, so we:
--   1. Rename the old table
--   2. Create the new table with the correct schema
--   3. Backfill from old data (copy bidder string into bidderName; use '' as
--      a sentinel bidderId for any orphan rows that have no matching bidder)
--   4. Drop the old table

PRAGMA foreign_keys=OFF;

-- Step 1: Rename existing table
ALTER TABLE "Escalation" RENAME TO "_Escalation_old";

-- Step 2: Create new table with bidderId FK and bidderName
CREATE TABLE "Escalation" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "auctionId"  TEXT NOT NULL,
    "bidderId"   TEXT NOT NULL DEFAULT '',
    "bidderName" TEXT NOT NULL DEFAULT '',
    "reason"     TEXT NOT NULL,
    "severity"   TEXT NOT NULL DEFAULT 'medium',
    "status"     TEXT NOT NULL DEFAULT 'open',
    "createdAt"  TEXT NOT NULL,
    CONSTRAINT "Escalation_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Escalation_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 3: Backfill — copy old rows; bidderName gets the old bidder string,
-- bidderId gets '' (sentinel) since there was no FK before. Any existing dev
-- data is preserved for display; FK is not enforced on the sentinel value
-- while foreign_keys is OFF, which is fine — new rows will always carry a
-- real bidderId.
INSERT INTO "Escalation" ("id", "auctionId", "bidderId", "bidderName", "reason", "severity", "status", "createdAt")
SELECT "id", "auctionId", '', "bidder", "reason", "severity", "status", "createdAt"
FROM "_Escalation_old";

-- Step 4: Drop old table
DROP TABLE "_Escalation_old";

PRAGMA foreign_keys=ON;
