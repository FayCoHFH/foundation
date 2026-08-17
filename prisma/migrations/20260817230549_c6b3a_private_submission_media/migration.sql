-- CreateEnum
CREATE TYPE "PublicStorySubmissionAttemptStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaRejectionReason" AS ENUM ('UNSUPPORTED_FORMAT', 'FILE_TOO_LARGE', 'SUBMISSION_TOTAL_TOO_LARGE', 'DIMENSIONS_EXCEEDED', 'CORRUPTED_IMAGE', 'DUPLICATE_IMAGE', 'PROCESSING_FAILED');

-- CreateTable
CREATE TABLE "public_story_submission_attempt" (
    "id" UUID NOT NULL,
    "recoveryTokenHash" CHAR(64) NOT NULL,
    "status" "PublicStorySubmissionAttemptStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submissionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_story_submission_media" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "submissionId" UUID,
    "originalFilename" VARCHAR(255),
    "declaredMimeType" VARCHAR(127),
    "originalByteSize" INTEGER,
    "ordinal" INTEGER,
    "description" VARCHAR(300),
    "suggestedPhotoCredit" VARCHAR(160),
    "involvesMinor" BOOLEAN NOT NULL DEFAULT false,
    "involvesHomeownerOrApplicant" BOOLEAN NOT NULL DEFAULT false,
    "involvesOtherIdentifiablePerson" BOOLEAN NOT NULL DEFAULT false,
    "depictsPrivateResidence" BOOLEAN NOT NULL DEFAULT false,
    "containsSensitivePersonalCircumstances" BOOLEAN NOT NULL DEFAULT false,
    "technicalStatus" "PublicStorySubmissionMediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "rejectionReason" "PublicStorySubmissionMediaRejectionReason",
    "quarantineStorageKey" VARCHAR(240),
    "originalSha256" CHAR(64),
    "uploadAuthorizationNonceHash" CHAR(64) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "binaryDeletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_attempt_recoveryTokenHash_key" ON "public_story_submission_attempt"("recoveryTokenHash");

-- CreateIndex
CREATE INDEX "public_story_submission_attempt_status_expiresAt_id_idx" ON "public_story_submission_attempt"("status", "expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_attempt_id_version_key" ON "public_story_submission_attempt"("id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_uploadAuthorizationNonceHash_key" ON "public_story_submission_media"("uploadAuthorizationNonceHash");

-- CreateIndex
CREATE INDEX "public_story_submission_media_attemptId_technicalStatus_ord_idx" ON "public_story_submission_media"("attemptId", "technicalStatus", "ordinal");

-- CreateIndex
CREATE INDEX "public_story_submission_media_attemptId_originalSha256_idx" ON "public_story_submission_media"("attemptId", "originalSha256");

-- CreateIndex
CREATE INDEX "public_story_submission_media_submissionId_ordinal_idx" ON "public_story_submission_media"("submissionId", "ordinal");

-- CreateIndex
CREATE INDEX "public_story_submission_media_technicalStatus_binaryDeleted_idx" ON "public_story_submission_media"("technicalStatus", "binaryDeletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_id_version_key" ON "public_story_submission_media"("id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_attemptId_ordinal_key" ON "public_story_submission_media"("attemptId", "ordinal");

-- AddForeignKey
ALTER TABLE "public_story_submission_attempt" ADD CONSTRAINT "public_story_submission_attempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media" ADD CONSTRAINT "public_story_submission_media_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public_story_submission_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media" ADD CONSTRAINT "public_story_submission_media_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
