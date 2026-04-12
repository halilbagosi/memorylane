-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "caregivers" ADD COLUMN     "scheduled_delete_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "delegation_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "from_caregiver_id" TEXT NOT NULL,
    "to_caregiver_id" TEXT NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "delegation_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_from_caregiver_id_fkey" FOREIGN KEY ("from_caregiver_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_to_caregiver_id_fkey" FOREIGN KEY ("to_caregiver_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
