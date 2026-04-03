/*
  Warnings:

  - You are about to drop the column `join_code` on the `patients` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[patient_join_code]` on the table `patients` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `decoy_1` to the `media` table without a default value. This is not possible if the table is not empty.
  - Added the required column `decoy_2` to the `media` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `media` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by` to the `patients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patient_join_code` to the `patients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `surname` to the `patients` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "media" DROP CONSTRAINT "media_caregiver_id_fkey";

-- DropIndex
DROP INDEX "patients_join_code_key";

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "decoy_1" TEXT NOT NULL,
ADD COLUMN     "decoy_2" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "caregiver_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patients" DROP COLUMN "join_code",
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "device_token" TEXT,
ADD COLUMN     "patient_join_code" TEXT NOT NULL,
ADD COLUMN     "surname" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN     "end_attempt_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "caregiver_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" TEXT NOT NULL,
    "caregiver_id" TEXT NOT NULL,
    "reset_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_correct" INTEGER NOT NULL,
    "total_incorrect" INTEGER NOT NULL,
    "total_attempts" INTEGER NOT NULL,
    "accuracy_percentage" DOUBLE PRECISION NOT NULL,
    "average_time_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_patient_join_code_key" ON "patients"("patient_join_code");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "caregivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
