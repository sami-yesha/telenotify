-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "method" TEXT,
ADD COLUMN     "passIdentityId" TEXT,
ADD COLUMN     "passJoinToken" TEXT,
ADD COLUMN     "passMessageId" TEXT,
ADD COLUMN     "passPushedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PassIdentity" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassIdentity_telegramUserId_key" ON "PassIdentity"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PassIdentity_phone_key" ON "PassIdentity"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_passJoinToken_key" ON "Verification"("passJoinToken");

-- CreateIndex
CREATE INDEX "Verification_passIdentityId_passPushedAt_idx" ON "Verification"("passIdentityId", "passPushedAt");

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_passIdentityId_fkey" FOREIGN KEY ("passIdentityId") REFERENCES "PassIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

