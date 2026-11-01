-- CreateEnum
CREATE TYPE "LimitRequestStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "customMonthlyQuota" INTEGER,
ADD COLUMN     "limitDeclineReason" TEXT,
ADD COLUMN     "limitRequestReason" TEXT,
ADD COLUMN     "limitRequestStatus" "LimitRequestStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "limitRequested" INTEGER,
ADD COLUMN     "limitRequestedAt" TIMESTAMP(3);


-- The free limit drops from 10,000 to 1,000 a month for new organizations. The Terms
-- promise 30 days' notice of a limit change, so existing free organizations keep 10,000
-- until an operator changes it in /admin.
UPDATE "Organization" SET "customMonthlyQuota" = 10000 WHERE "plan" = 'FREE';
