-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "botManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "botSetupCodeHash" TEXT,
ADD COLUMN     "botSetupError" TEXT,
ADD COLUMN     "botSetupExpiresAt" TIMESTAMP(3),
ADD COLUMN     "botSetupTelegramId" TEXT,
ADD COLUMN     "botSetupUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Environment_botSetupCodeHash_key" ON "Environment"("botSetupCodeHash");
