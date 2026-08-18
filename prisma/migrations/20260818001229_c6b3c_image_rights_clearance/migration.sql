-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaSubjectType" AS ENUM ('IDENTIFIABLE_ADULT', 'MINOR');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceType" AS ENUM ('IMAGE_RIGHTS', 'IDENTIFIABLE_ADULT', 'MINOR_GUARDIAN', 'HOMEOWNER_APPLICANT', 'PRIVATE_RESIDENCE', 'SENSITIVE_CIRCUMSTANCES', 'SUBMITTER_LIKENESS');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaEvidenceType" AS ENUM ('EXISTING_HABITAT_RELEASE', 'NEW_RELEASE', 'OTHER_APPROVED_AUTHORIZATION', 'SUBMITTER_LIKENESS_CONSENT', 'STAFF_PRIVACY_REVIEW');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceRevocationReason" AS ENUM ('SUBJECT_REQUEST', 'STAFF_REVIEW', 'EVIDENCE_INVALIDATED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaUse" AS ENUM ('WEBSITE_PUBLICATION', 'SOCIAL_MEDIA', 'PRINT', 'FUNDRAISING_PROMOTIONAL', 'PAID_ADVERTISING');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaRestrictionState" AS ENUM ('ACTIVE', 'RESTORED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaRestrictionReason" AS ENUM ('CLEARANCE_EXPIRED', 'CLEARANCE_REVOKED', 'CLEARANCE_INSUFFICIENT', 'PRIVACY_CONCERN', 'SUBJECT_REVOCATION_REQUEST', 'STAFF_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaRevocationRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "public_story_submission" ADD COLUMN     "rightsDeclarationAccepted" BOOLEAN,
ADD COLUMN     "rightsDeclarationAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "rightsDeclarationVersion" VARCHAR(64),
ADD COLUMN     "submitterLikenessConsentAccepted" BOOLEAN,
ADD COLUMN     "submitterLikenessConsentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "submitterLikenessConsentVersion" VARCHAR(64);

-- CreateTable
CREATE TABLE "public_story_submission_media_subject" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "displayLabel" VARCHAR(160) NOT NULL,
    "subjectType" "PublicStorySubmissionMediaSubjectType" NOT NULL,
    "isSubmitter" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_subject_applicability" (
    "subjectId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_story_submission_media_subject_applicability_pkey" PRIMARY KEY ("subjectId","mediaId")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_clearance" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "clearanceType" "PublicStorySubmissionMediaClearanceType" NOT NULL,
    "status" "PublicStorySubmissionMediaClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "subjectId" UUID,
    "dateObtained" TIMESTAMP(3),
    "dateVerified" TIMESTAMP(3),
    "verifiedByAdminUserId" UUID,
    "expiresAt" TIMESTAMP(3),
    "evidenceType" "PublicStorySubmissionMediaEvidenceType",
    "existingEvidenceReference" VARCHAR(240),
    "existingEvidenceVersion" VARCHAR(64),
    "confidentialNote" VARCHAR(1000),
    "websitePublicationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "socialMediaAllowed" BOOLEAN NOT NULL DEFAULT false,
    "printAllowed" BOOLEAN NOT NULL DEFAULT false,
    "fundraisingPromotionalAllowed" BOOLEAN NOT NULL DEFAULT false,
    "paidAdvertisingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "otherRestrictionsPresent" BOOLEAN NOT NULL DEFAULT false,
    "confidentialRestrictionsNote" VARCHAR(1000),
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminUserId" UUID,
    "revocationReason" "PublicStorySubmissionMediaClearanceRevocationReason",
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_clearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_clearance_applicability" (
    "clearanceId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_story_submission_media_clearance_applicability_pkey" PRIMARY KEY ("clearanceId","mediaId")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_restriction" (
    "id" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "state" "PublicStorySubmissionMediaRestrictionState" NOT NULL DEFAULT 'ACTIVE',
    "reason" "PublicStorySubmissionMediaRestrictionReason" NOT NULL,
    "restrictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restrictedByAdminUserId" UUID NOT NULL,
    "confidentialNote" VARCHAR(1000),
    "restoredAt" TIMESTAMP(3),
    "restoredByAdminUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_restriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_revocation_request" (
    "id" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "subjectId" UUID,
    "status" "PublicStorySubmissionMediaRevocationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminUserId" UUID,
    "confidentialNote" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_revocation_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_story_submission_media_subject_submissionId_subjectT_idx" ON "public_story_submission_media_subject"("submissionId", "subjectType");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_subject_id_version_key" ON "public_story_submission_media_subject"("id", "version");

-- CreateIndex
CREATE INDEX "public_story_submission_media_subject_applicability_mediaId_idx" ON "public_story_submission_media_subject_applicability"("mediaId", "subjectId");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_submissionId_cleara_idx" ON "public_story_submission_media_clearance"("submissionId", "clearanceType", "status");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_subjectId_clearance_idx" ON "public_story_submission_media_clearance"("subjectId", "clearanceType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_clearance_id_version_key" ON "public_story_submission_media_clearance"("id", "version");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_applicability_media_idx" ON "public_story_submission_media_clearance_applicability"("mediaId", "clearanceId");

-- CreateIndex
CREATE INDEX "public_story_submission_media_restriction_mediaId_state_idx" ON "public_story_submission_media_restriction"("mediaId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_restriction_id_version_key" ON "public_story_submission_media_restriction"("id", "version");

-- CreateIndex
CREATE INDEX "public_story_submission_media_revocation_request_mediaId_st_idx" ON "public_story_submission_media_revocation_request"("mediaId", "status");

-- CreateIndex
CREATE INDEX "public_story_submission_media_revocation_request_subjectId__idx" ON "public_story_submission_media_revocation_request"("subjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_revocation_request_id_version_key" ON "public_story_submission_media_revocation_request"("id", "version");

-- AddForeignKey
ALTER TABLE "public_story_submission_media_subject" ADD CONSTRAINT "public_story_submission_media_subject_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_subject_applicability" ADD CONSTRAINT "public_story_submission_media_subject_applicability_subjec_fkey" FOREIGN KEY ("subjectId") REFERENCES "public_story_submission_media_subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_subject_applicability" ADD CONSTRAINT "public_story_submission_media_subject_applicability_mediaI_fkey" FOREIGN KEY ("mediaId") REFERENCES "public_story_submission_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance" ADD CONSTRAINT "public_story_submission_media_clearance_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance" ADD CONSTRAINT "public_story_submission_media_clearance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public_story_submission_media_subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance" ADD CONSTRAINT "public_story_submission_media_clearance_verifiedByAdminUse_fkey" FOREIGN KEY ("verifiedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance" ADD CONSTRAINT "public_story_submission_media_clearance_revokedByAdminUser_fkey" FOREIGN KEY ("revokedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance_applicability" ADD CONSTRAINT "public_story_submission_media_clearance_applicability_clea_fkey" FOREIGN KEY ("clearanceId") REFERENCES "public_story_submission_media_clearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance_applicability" ADD CONSTRAINT "public_story_submission_media_clearance_applicability_medi_fkey" FOREIGN KEY ("mediaId") REFERENCES "public_story_submission_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_restriction" ADD CONSTRAINT "public_story_submission_media_restriction_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public_story_submission_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_restriction" ADD CONSTRAINT "public_story_submission_media_restriction_restrictedByAdmi_fkey" FOREIGN KEY ("restrictedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_restriction" ADD CONSTRAINT "public_story_submission_media_restriction_restoredByAdminU_fkey" FOREIGN KEY ("restoredByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_revocation_request" ADD CONSTRAINT "public_story_submission_media_revocation_request_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public_story_submission_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_revocation_request" ADD CONSTRAINT "public_story_submission_media_revocation_request_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public_story_submission_media_subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_revocation_request" ADD CONSTRAINT "public_story_submission_media_revocation_request_resolvedB_fkey" FOREIGN KEY ("resolvedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
