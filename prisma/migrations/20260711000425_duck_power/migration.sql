-- AlterTable
ALTER TABLE "User" ADD COLUMN     "duckPower" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DuckPowerLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuckPowerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuckPowerLog_userId_createdAt_idx" ON "DuckPowerLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DuckPowerLog" ADD CONSTRAINT "DuckPowerLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
