CREATE TABLE "patient_messages" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "media_id" TEXT,
    "content" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_messages_patient_id_read_at_created_at_idx" ON "patient_messages"("patient_id", "read_at", "created_at");
CREATE INDEX "patient_messages_media_id_idx" ON "patient_messages"("media_id");

ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
