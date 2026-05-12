CREATE TABLE IF NOT EXISTS "ai_training_samples" (
  "id" TEXT NOT NULL,
  "patient_id" TEXT,
  "accuracy" DOUBLE PRECISION NOT NULL,
  "response_time_normalized" DOUBLE PRECISION NOT NULL,
  "time_of_day" DOUBLE PRECISION NOT NULL,
  "current_difficulty" DOUBLE PRECISION NOT NULL,
  "target_complexity" DOUBLE PRECISION NOT NULL,
  "first_tap_correct" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_training_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_training_samples_patient_id_created_at_idx"
ON "ai_training_samples"("patient_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "ai_training_samples"
  ADD CONSTRAINT "ai_training_samples_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
