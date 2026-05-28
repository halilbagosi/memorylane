/*
  Warnings:

  - You are about to drop the column `legacy_correct_name` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_decoy_1` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_decoy_2` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_relationship` on the `media` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "caregivers" ADD COLUMN IF NOT EXISTS "is_subscribed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (idempotent: legacy columns may already be absent)
ALTER TABLE "media" DROP COLUMN IF EXISTS "legacy_correct_name";
ALTER TABLE "media" DROP COLUMN IF EXISTS "legacy_decoy_1";
ALTER TABLE "media" DROP COLUMN IF EXISTS "legacy_decoy_2";
ALTER TABLE "media" DROP COLUMN IF EXISTS "legacy_relationship";
