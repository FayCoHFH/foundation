-- CreateTable
CREATE TABLE "public_story_submission_story_conversion" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    "sourceSubmissionVersion" INTEGER NOT NULL,
    "convertedByAdminUserId" UUID NOT NULL,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_story_submission_story_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_story_conversion_submissionId_key" ON "public_story_submission_story_conversion"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_story_conversion_storyId_key" ON "public_story_submission_story_conversion"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_story_conversion_correlationId_key" ON "public_story_submission_story_conversion"("correlationId");

-- CreateIndex
CREATE INDEX "public_story_submission_story_conversion_convertedByAdminUs_idx" ON "public_story_submission_story_conversion"("convertedByAdminUserId", "convertedAt");

-- RenameForeignKey
ALTER TABLE "public_story_submission_media_promotion" RENAME CONSTRAINT "media_promotion_mediaAssetId_fkey" TO "public_story_submission_media_promotion_mediaAssetId_fkey";

-- RenameForeignKey
ALTER TABLE "public_story_submission_media_promotion" RENAME CONSTRAINT "media_promotion_promotedByAdminUserId_fkey" TO "public_story_submission_media_promotion_promotedByAdminUse_fkey";

-- RenameForeignKey
ALTER TABLE "public_story_submission_media_promotion" RENAME CONSTRAINT "media_promotion_sourceMediaId_fkey" TO "public_story_submission_media_promotion_sourceMediaId_fkey";

-- RenameForeignKey
ALTER TABLE "public_story_submission_media_promotion" RENAME CONSTRAINT "media_promotion_sourceSubmissionId_fkey" TO "public_story_submission_media_promotion_sourceSubmissionId_fkey";

-- RenameForeignKey
ALTER TABLE "public_story_submission_media_promotion_clearance" RENAME CONSTRAINT "media_promotion_clearance_promotionId_fkey" TO "public_story_submission_media_promotion_clearance_promotio_fkey";

-- AddForeignKey
ALTER TABLE "public_story_submission_story_conversion" ADD CONSTRAINT "public_story_submission_story_conversion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_story_conversion" ADD CONSTRAINT "public_story_submission_story_conversion_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_story_conversion" ADD CONSTRAINT "public_story_submission_story_conversion_convertedByAdminU_fkey" FOREIGN KEY ("convertedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public_story_submission_media_promotion_sourceSubmissionId_sour" RENAME TO "public_story_submission_media_promotion_sourceSubmissionId__idx";

-- RenameIndex
ALTER INDEX "public_story_submission_media_promotion_clearance_clearanceId_i" RENAME TO "public_story_submission_media_promotion_clearance_clearance_idx";

-- RenameIndex
ALTER INDEX "public_story_submission_media_promotion_clearance_promotionId_c" RENAME TO "public_story_submission_media_promotion_clearance_promotion_key";
