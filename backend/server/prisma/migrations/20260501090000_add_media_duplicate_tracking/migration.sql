ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "aws_face_id" TEXT;

CREATE INDEX IF NOT EXISTS "media_patient_id_content_hash_idx"
  ON "media"("patient_id", "content_hash");
