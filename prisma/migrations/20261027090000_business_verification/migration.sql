-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "businessRejectReason" TEXT,
ADD COLUMN     "businessRequestedAt" TIMESTAMP(3),
ADD COLUMN     "businessStatus" "BusinessStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "businessVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "tin" TEXT,
ADD COLUMN     "tradeLicense" TEXT;

