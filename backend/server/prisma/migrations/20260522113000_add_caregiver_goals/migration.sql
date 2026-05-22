CREATE TABLE IF NOT EXISTS "caregiver_goals" (
  "id" TEXT NOT NULL,
  "caregiver_id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "target_accuracy" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "caregiver_goals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "caregiver_goals_caregiver_id_patient_id_key"
ON "caregiver_goals"("caregiver_id", "patient_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_goals_caregiver_id_fkey'
  ) THEN
    ALTER TABLE "caregiver_goals"
    ADD CONSTRAINT "caregiver_goals_caregiver_id_fkey"
    FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_goals_patient_id_fkey'
  ) THEN
    ALTER TABLE "caregiver_goals"
    ADD CONSTRAINT "caregiver_goals_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
