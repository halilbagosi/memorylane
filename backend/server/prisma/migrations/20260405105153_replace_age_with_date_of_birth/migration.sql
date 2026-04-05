/*
  Warnings:

  - You are about to drop the column `age` on the `patients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "patients" DROP COLUMN "age",
ADD COLUMN     "date_of_birth" DATE;
