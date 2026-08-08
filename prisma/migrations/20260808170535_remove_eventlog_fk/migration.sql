-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "at" TEXT NOT NULL
);
INSERT INTO "new_EventLog" ("at", "auctionId", "id", "payload", "type") SELECT "at", "auctionId", "id", "payload", "type" FROM "EventLog";
DROP TABLE "EventLog";
ALTER TABLE "new_EventLog" RENAME TO "EventLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
