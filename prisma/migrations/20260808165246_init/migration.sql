-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "bidders" INTEGER NOT NULL DEFAULT 0,
    "topBid" TEXT NOT NULL DEFAULT '$0',
    "floor" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "terms" TEXT NOT NULL DEFAULT '',
    "channels" TEXT NOT NULL DEFAULT 'Web chat',
    "autoExtend" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "joinCode" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Bidder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastBid" TEXT NOT NULL DEFAULT '—',
    "connection" TEXT NOT NULL DEFAULT 'Web chat',
    "email" TEXT,
    CONSTRAINT "Bidder_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidderId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'system',
    "at" TEXT NOT NULL,
    CONSTRAINT "Message_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "bidder" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "Escalation_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'SOL',
    "wallet" TEXT NOT NULL,
    "signature" TEXT NOT NULL DEFAULT 'awaiting-wallet-signature',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "network" TEXT NOT NULL DEFAULT 'Solana devnet',
    "paymentRequest" TEXT NOT NULL,
    "verWallet" TEXT NOT NULL DEFAULT 'pending',
    "verAmount" TEXT NOT NULL DEFAULT 'pending',
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TEXT NOT NULL,
    CONSTRAINT "Settlement_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "reserveProtection" BOOLEAN NOT NULL DEFAULT true,
    "autoExtend" BOOLEAN NOT NULL DEFAULT true,
    "humanApproval" BOOLEAN NOT NULL DEFAULT false,
    "webChat" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "PolicyRule_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    CONSTRAINT "EventLog_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_joinCode_key" ON "Auction"("joinCode");
