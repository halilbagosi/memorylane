/*
  Warnings:

  - You are about to drop the column `legacy_correct_name` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_decoy_1` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_decoy_2` on the `media` table. All the data in the column will be lost.
  - You are about to drop the column `legacy_relationship` on the `media` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "media" DROP COLUMN "legacy_correct_name",
DROP COLUMN "legacy_decoy_1",
DROP COLUMN "legacy_decoy_2",
DROP COLUMN "legacy_relationship";
