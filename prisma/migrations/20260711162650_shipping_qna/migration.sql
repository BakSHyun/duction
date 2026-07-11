-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shipAddress" TEXT,
ADD COLUMN     "shipName" TEXT,
ADD COLUMN     "shipPhone" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shipAddress" TEXT,
ADD COLUMN     "shipName" TEXT,
ADD COLUMN     "shipPhone" TEXT;

-- CreateTable
CREATE TABLE "AuctionQuestion" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuctionQuestion_auctionId_createdAt_idx" ON "AuctionQuestion"("auctionId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuctionQuestion" ADD CONSTRAINT "AuctionQuestion_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
