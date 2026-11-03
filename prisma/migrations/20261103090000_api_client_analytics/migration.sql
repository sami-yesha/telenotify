-- AlterTable
ALTER TABLE "ApiRequestLog" ADD COLUMN     "client" TEXT,
ADD COLUMN     "clientDetail" TEXT;

-- CreateIndex
CREATE INDEX "ApiRequestLog_createdAt_idx" ON "ApiRequestLog"("createdAt");

