-- CreateTable
CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "caregiver_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
