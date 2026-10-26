-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "smsDailyLimit" INTEGER;

-- CreateIndex
CREATE INDEX "Message_environmentId_fallbackAt_idx" ON "Message"("environmentId", "fallbackAt");

