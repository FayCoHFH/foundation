-- C6B-3E: public media library promotion is an explicit, provenance-bound
-- projection of a private sanitized submission derivative.
CREATE TYPE "MediaAssetLifecycle" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MediaAssetFormat" AS ENUM ('JPEG');
CREATE TYPE "MediaAssetCreditTreatment" AS ENUM ('VERIFIED_CREDIT', 'ORGANIZATIONAL_CREDIT', 'NO_PUBLIC_CREDIT');
CREATE TYPE "MediaUsageSubjectType" AS ENUM ('STORY_REVISION', 'NEWS_REVISION', 'PUBLICATION');

CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "publicStorageKey" VARCHAR(240) NOT NULL,
    "contentType" VARCHAR(127) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "format" "MediaAssetFormat" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "creditTreatment" "MediaAssetCreditTreatment" NOT NULL,
    "publicCredit" VARCHAR(240),
    "lifecycle" "MediaAssetLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAdminUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_story_submission_media_promotion" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "sourceMediaId" UUID NOT NULL,
    "sourceSubmissionId" UUID NOT NULL,
    "promotedByAdminUserId" UUID NOT NULL,
    "promotedAt" TIMESTAMP(3) NOT NULL,
    "sourceMediaVersion" INTEGER NOT NULL,
    "sourceProcessedAt" TIMESTAMP(3) NOT NULL,
    "sourceDetectedFormat" VARCHAR(16) NOT NULL,
    "baselineUse" "PublicStorySubmissionMediaUse" NOT NULL DEFAULT 'WEBSITE_PUBLICATION',
    "creditTreatment" "MediaAssetCreditTreatment" NOT NULL,
    "publicCredit" VARCHAR(240),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "public_story_submission_media_promotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_story_submission_media_promotion_clearance" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "clearanceId" UUID NOT NULL,
    "clearanceVersion" INTEGER NOT NULL,
    "clearanceType" "PublicStorySubmissionMediaClearanceType" NOT NULL,
    "status" "PublicStorySubmissionMediaClearanceStatus" NOT NULL,
    "websitePublicationAllowed" BOOLEAN NOT NULL,
    "socialMediaAllowed" BOOLEAN NOT NULL,
    "printAllowed" BOOLEAN NOT NULL,
    "fundraisingPromotionalAllowed" BOOLEAN NOT NULL,
    "paidAdvertisingAllowed" BOOLEAN NOT NULL,
    "otherRestrictionsPresent" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "evidenceDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "public_story_submission_media_promotion_clearance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_usage" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "usageType" "PublicStorySubmissionMediaUse" NOT NULL,
    "subjectType" "MediaUsageSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "media_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_asset_publicStorageKey_key" ON "media_asset"("publicStorageKey");
CREATE INDEX "media_asset_lifecycle_createdAt_idx" ON "media_asset"("lifecycle", "createdAt");
CREATE UNIQUE INDEX "public_story_submission_media_promotion_mediaAssetId_key" ON "public_story_submission_media_promotion"("mediaAssetId");
CREATE UNIQUE INDEX "public_story_submission_media_promotion_sourceMediaId_key" ON "public_story_submission_media_promotion"("sourceMediaId");
CREATE INDEX "public_story_submission_media_promotion_sourceSubmissionId_sourceMediaId_idx" ON "public_story_submission_media_promotion"("sourceSubmissionId", "sourceMediaId");
CREATE UNIQUE INDEX "public_story_submission_media_promotion_clearance_promotionId_clearanceId_key" ON "public_story_submission_media_promotion_clearance"("promotionId", "clearanceId");
CREATE INDEX "public_story_submission_media_promotion_clearance_clearanceId_idx" ON "public_story_submission_media_promotion_clearance"("clearanceId");
CREATE UNIQUE INDEX "media_usage_mediaAssetId_usageType_subjectType_subjectId_key" ON "media_usage"("mediaAssetId", "usageType", "subjectType", "subjectId");
CREATE INDEX "media_usage_mediaAssetId_usageType_idx" ON "media_usage"("mediaAssetId", "usageType");
CREATE INDEX "media_usage_subjectType_subjectId_idx" ON "media_usage"("subjectType", "subjectId");

ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_story_submission_media_promotion" ADD CONSTRAINT "media_promotion_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_story_submission_media_promotion" ADD CONSTRAINT "media_promotion_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "public_story_submission_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_story_submission_media_promotion" ADD CONSTRAINT "media_promotion_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "public_story_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_story_submission_media_promotion" ADD CONSTRAINT "media_promotion_promotedByAdminUserId_fkey" FOREIGN KEY ("promotedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_story_submission_media_promotion_clearance" ADD CONSTRAINT "media_promotion_clearance_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public_story_submission_media_promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_usage" ADD CONSTRAINT "media_usage_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
