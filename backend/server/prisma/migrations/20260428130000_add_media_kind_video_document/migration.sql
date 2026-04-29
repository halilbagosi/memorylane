-- Add VIDEO and DOCUMENT values to MediaKind enum.
-- The initial migration only created PHOTO and AUDIO; these two were added
-- to the Prisma schema but never reflected in the database, causing a
-- PostgreSQL error (and HTTP 500) whenever a caregiver uploaded a video
-- or document memory.
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'DOCUMENT';
