ALTER TABLE "patients"
ADD COLUMN "quiz_reminder_times" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
