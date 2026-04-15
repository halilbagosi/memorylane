-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ROLE_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ROLE_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'ROLE_REQUEST_DECLINED';

-- CreateTable
CREATE TABLE "role_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "current_primary_id" TEXT NOT NULL,
    "status" "RoleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_current_primary_id_fkey" FOREIGN KEY ("current_primary_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
