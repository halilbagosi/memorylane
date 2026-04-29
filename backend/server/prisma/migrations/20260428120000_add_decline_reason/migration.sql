-- AlterTable
ALTER TABLE "delegation_requests" ADD COLUMN "decline_reason" TEXT;

-- AlterTable
ALTER TABLE "role_requests" ADD COLUMN "decline_reason" TEXT;
