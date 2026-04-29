CREATE TYPE "MediaCollection" AS ENUM ('MEMORY', 'QUIZ');

ALTER TABLE "media"
  ADD COLUMN "collection" "MediaCollection" NOT NULL DEFAULT 'MEMORY',
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "relationship_type" TEXT,
  ADD COLUMN "decoy_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "note" TEXT,
  ADD COLUMN "event_year" INTEGER,
  ADD COLUMN "memory_category" TEXT;

ALTER TABLE "media" RENAME COLUMN "correct_name" TO "legacy_correct_name";
ALTER TABLE "media" RENAME COLUMN "relationship" TO "legacy_relationship";
ALTER TABLE "media" RENAME COLUMN "decoy_1" TO "legacy_decoy_1";
ALTER TABLE "media" RENAME COLUMN "decoy_2" TO "legacy_decoy_2";
