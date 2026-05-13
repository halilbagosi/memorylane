-- CreateEnum
CREATE TYPE "DementiaLevel" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "dementia_level" "DementiaLevel";
