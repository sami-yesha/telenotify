-- CreateEnum
CREATE TYPE "MessageFormat" AS ENUM ('PLAIN', 'MARKDOWN');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "format" "MessageFormat" NOT NULL DEFAULT 'PLAIN';

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "format" "MessageFormat" NOT NULL DEFAULT 'PLAIN';

