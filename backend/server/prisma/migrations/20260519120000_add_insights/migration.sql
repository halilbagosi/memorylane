ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INSIGHT_POST_PUBLISHED';

ALTER TABLE "caregivers"
ADD COLUMN IF NOT EXISTS "insight_notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "insight_posts" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "introduction" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "article_url" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL,
  "reading_minutes" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "insight_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "insight_posts_slug_key" ON "insight_posts"("slug");

CREATE TABLE IF NOT EXISTS "saved_insight_posts" (
  "caregiver_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "saved_insight_posts_pkey" PRIMARY KEY ("caregiver_id","post_id")
);

ALTER TABLE "saved_insight_posts"
ADD CONSTRAINT "saved_insight_posts_caregiver_id_fkey"
FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_insight_posts"
ADD CONSTRAINT "saved_insight_posts_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "insight_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "insight_posts" (
  "id", "slug", "title", "introduction", "summary", "article_url", "published_at",
  "reading_minutes", "source", "institution", "tags"
) VALUES
(
  'insight-tips-caregivers-2026',
  'practical-caregiving-tips-for-dementia',
  'Practical Caregiving Tips for Dementia',
  'A caregiver-focused guide to everyday support, communication, routines, safety, and self-care when caring for someone living with dementia.',
  'The guidance emphasizes steady routines, calm communication, planning ahead for daily activities, adapting the home environment, and protecting caregiver health. It is useful as a practical checklist for families managing changing symptoms across stages.',
  'https://www.alzheimers.gov/life-with-dementia/tips-caregivers',
  '2026-05-15T00:00:00.000Z',
  8,
  'Alzheimers.gov caregiver guidance',
  'U.S. Department of Health and Human Services',
  ARRAY['tips','caregiver wellbeing','specific symptoms','stage 1','stage 2','stage 3','resources']
),
(
  'insight-nia-caregiver-advances-2022',
  'dementia-care-and-caregiver-research-advances',
  'Dementia Care and Caregiver Research Advances',
  'A research progress summary on dementia care models, caregiver support, and services intended to improve outcomes for people living with dementia and their families.',
  'The article highlights care and caregiver research from the 2021-2022 scientific advances report, including the need for practical supports, better systems of care, and attention to caregiver burden and wellbeing.',
  'https://www.nia.nih.gov/2021-2022-alzheimers-disease-related-dementias-scientific-advances/dementia-care-and-caregiver',
  '2022-12-01T00:00:00.000Z',
  6,
  '2021-2022 Alzheimer''s Disease and Related Dementias Scientific Advances',
  'National Institute on Aging',
  ARRAY['research','caregiver wellbeing','study/treatment','resources','stage 2','stage 3']
),
(
  'insight-latest-diagnosis-treatment-dementia-2023',
  'latest-advances-diagnosis-treatment-dementia',
  'Latest Advances in the Diagnosis and Treatment of Dementia',
  'A peer-reviewed overview of current dementia diagnosis and treatment approaches, including clinical evaluation, biomarkers, medication options, and emerging research directions.',
  'The review summarizes advances in diagnosis and treatment while reinforcing that dementia care requires individualized assessment, symptom management, and awareness of developing therapeutic research.',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC10787596/',
  '2023-12-01T00:00:00.000Z',
  12,
  'Hafiz R. et al., The latest advances in the diagnosis and treatment of dementia',
  'National Library of Medicine / PubMed Central',
  ARRAY['research','medication updates','study/treatment','trial','specific symptoms','stage 1','stage 2']
)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "introduction" = EXCLUDED."introduction",
  "summary" = EXCLUDED."summary",
  "article_url" = EXCLUDED."article_url",
  "published_at" = EXCLUDED."published_at",
  "reading_minutes" = EXCLUDED."reading_minutes",
  "source" = EXCLUDED."source",
  "institution" = EXCLUDED."institution",
  "tags" = EXCLUDED."tags",
  "updated_at" = CURRENT_TIMESTAMP;
