ALTER TABLE "patients"
ADD COLUMN IF NOT EXISTS "quiz_difficulty" TEXT NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE "patients"
ALTER COLUMN "quiz_difficulty" TYPE TEXT USING "quiz_difficulty"::text;

ALTER TABLE "media"
ADD COLUMN IF NOT EXISTS "hint" TEXT,
ADD COLUMN IF NOT EXISTS "nickname" TEXT;
