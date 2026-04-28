-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED');

-- AlterTable: drop legacy URL columns and relax quiz-related fields
ALTER TABLE "media" DROP COLUMN IF EXISTS "image_url";
ALTER TABLE "media" DROP COLUMN IF EXISTS "audio_url";

ALTER TABLE "media" ALTER COLUMN "correct_name" DROP NOT NULL;
ALTER TABLE "media" ALTER COLUMN "relationship" DROP NOT NULL;
ALTER TABLE "media" ALTER COLUMN "decoy_1" DROP NOT NULL;
ALTER TABLE "media" ALTER COLUMN "decoy_2" DROP NOT NULL;

-- AlterTable: add new columns required by the encrypted upload pipeline
ALTER TABLE "media"
    ADD COLUMN "public_id" TEXT,
    ADD COLUMN "kind" "MediaKind",
    ADD COLUMN "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    ADD COLUMN "storage_key" TEXT,
    ADD COLUMN "content_type" TEXT,
    ADD COLUMN "byte_size" INTEGER,
    ADD COLUMN "wrapped_dek" TEXT,
    ADD COLUMN "dek_iv" TEXT,
    ADD COLUMN "dek_tag" TEXT,
    ADD COLUMN "payload_iv" TEXT,
    ADD COLUMN "payload_tag" TEXT,
    ADD COLUMN "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    ADD COLUMN "key_version" TEXT NOT NULL DEFAULT 'v1';

-- Backfill placeholders for any pre-existing rows so the NOT NULL + UNIQUE
-- constraints below can be applied safely. The Media table is unused by
-- runtime services, so this is a defensive no-op in practice.
UPDATE "media" SET "public_id"    = COALESCE("public_id",   "id")        WHERE "public_id"   IS NULL;
UPDATE "media" SET "kind"         = COALESCE("kind",        'PHOTO')     WHERE "kind"        IS NULL;
UPDATE "media" SET "storage_key"  = COALESCE("storage_key", 'legacy/' || "id") WHERE "storage_key" IS NULL;
UPDATE "media" SET "content_type" = COALESCE("content_type",'application/octet-stream') WHERE "content_type" IS NULL;
UPDATE "media" SET "byte_size"    = COALESCE("byte_size",   0)           WHERE "byte_size"   IS NULL;
UPDATE "media" SET "wrapped_dek"  = COALESCE("wrapped_dek", '')          WHERE "wrapped_dek" IS NULL;
UPDATE "media" SET "dek_iv"       = COALESCE("dek_iv",      '')          WHERE "dek_iv"      IS NULL;
UPDATE "media" SET "dek_tag"      = COALESCE("dek_tag",     '')          WHERE "dek_tag"     IS NULL;
UPDATE "media" SET "payload_iv"   = COALESCE("payload_iv",  '')          WHERE "payload_iv"  IS NULL;

-- Enforce NOT NULL on the new columns now that defaults are populated
ALTER TABLE "media" ALTER COLUMN "public_id"    SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "kind"         SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "storage_key"  SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "content_type" SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "byte_size"    SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "wrapped_dek"  SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "dek_iv"       SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "dek_tag"      SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "payload_iv"   SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_public_id_key"    ON "media"("public_id");
CREATE UNIQUE INDEX "media_storage_key_key"  ON "media"("storage_key");
CREATE INDEX        "media_patient_id_created_at_idx" ON "media"("patient_id", "created_at");
