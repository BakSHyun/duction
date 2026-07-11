-- DropIndex
DROP INDEX "PushSubscription_userId_idx";

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'webpush',
ALTER COLUMN "p256dh" DROP NOT NULL,
ALTER COLUMN "auth" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PushSubscription_userId_kind_idx" ON "PushSubscription"("userId", "kind");
