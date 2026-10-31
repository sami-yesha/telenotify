-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'CLI_ONLY';

-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "cliListenUntil" TIMESTAMP(3);

