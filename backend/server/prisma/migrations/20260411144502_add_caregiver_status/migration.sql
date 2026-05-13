-- CreateEnum
CREATE TYPE "CaregiverStatus" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'DEACTIVATED');

-- AlterTable
ALTER TABLE "caregivers" ADD COLUMN     "status" "CaregiverStatus" NOT NULL DEFAULT 'ACTIVE';
