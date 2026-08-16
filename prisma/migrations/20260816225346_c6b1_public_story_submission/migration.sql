-- CreateEnum
CREATE TYPE "PublicStorySubmissionStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'FOLLOW_UP', 'ACCEPTED', 'DECLINED', 'SPAM');

-- CreateTable
CREATE TABLE "public_story_submission" (
    "id" UUID NOT NULL,
    "submitterName" VARCHAR(120) NOT NULL,
    "submitterEmail" VARCHAR(254) NOT NULL,
    "relationshipToHabitat" VARCHAR(160) NOT NULL,
    "suggestedTitle" VARCHAR(160),
    "storyText" TEXT NOT NULL,
    "contactConsent" BOOLEAN NOT NULL,
    "privacyNoticeVersion" VARCHAR(64) NOT NULL,
    "privacyNoticeAcceptedAt" TIMESTAMP(3) NOT NULL,
    "editorialReviewAcknowledged" BOOLEAN NOT NULL,
    "sensitiveDataWarningAcknowledged" BOOLEAN NOT NULL,
    "publicationInterest" BOOLEAN,
    "involvesMinor" BOOLEAN NOT NULL DEFAULT false,
    "involvesHomeownerOrApplicant" BOOLEAN NOT NULL DEFAULT false,
    "containsSensitivePersonalCircumstances" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicStorySubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "internalReviewNote" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedByAdminUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public_story_submission"
  ADD CONSTRAINT "public_story_submission_required_text_check" CHECK (
    btrim("submitterName") <> ''
    AND btrim("submitterEmail") <> ''
    AND btrim("relationshipToHabitat") <> ''
    AND btrim("storyText") <> ''
    AND btrim("privacyNoticeVersion") <> ''
  ),
  ADD CONSTRAINT "public_story_submission_story_text_length_check" CHECK (
    char_length("storyText") BETWEEN 50 AND 12000
  ),
  ADD CONSTRAINT "public_story_submission_acknowledgements_check" CHECK (
    "contactConsent" AND "editorialReviewAcknowledged" AND "sensitiveDataWarningAcknowledged"
  ),
  ADD CONSTRAINT "public_story_submission_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "public_story_submission_status_actor_check" CHECK (
    ("status" = 'RECEIVED' AND "statusChangedByAdminUserId" IS NULL)
    OR ("status" <> 'RECEIVED' AND "statusChangedByAdminUserId" IS NOT NULL)
  ),
  ADD CONSTRAINT "public_story_submission_review_note_check" CHECK (
    "internalReviewNote" IS NULL OR btrim("internalReviewNote") <> ''
  );

-- CreateIndex
CREATE INDEX "public_story_submission_status_receivedAt_id_idx" ON "public_story_submission"("status", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "public_story_submission_receivedAt_id_idx" ON "public_story_submission"("receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_id_version_key" ON "public_story_submission"("id", "version");

-- AddForeignKey
ALTER TABLE "public_story_submission" ADD CONSTRAINT "public_story_submission_statusChangedByAdminUserId_fkey" FOREIGN KEY ("statusChangedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
