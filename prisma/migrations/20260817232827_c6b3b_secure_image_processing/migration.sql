-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PublicStorySubmissionMediaRejectionReason" ADD VALUE 'MIME_TYPE_MISMATCH';
ALTER TYPE "PublicStorySubmissionMediaRejectionReason" ADD VALUE 'MULTI_FRAME_UNSUPPORTED';

-- AlterTable
ALTER TABLE "public_story_submission_media" ADD COLUMN     "detectedFormat" VARCHAR(16),
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "reviewDerivativeByteSize" INTEGER,
ADD COLUMN     "reviewDerivativeFormat" VARCHAR(16),
ADD COLUMN     "reviewDerivativeHeight" INTEGER,
ADD COLUMN     "reviewDerivativeStorageKey" VARCHAR(240),
ADD COLUMN     "reviewDerivativeWidth" INTEGER,
ADD COLUMN     "sourceHeight" INTEGER,
ADD COLUMN     "sourceWidth" INTEGER;
