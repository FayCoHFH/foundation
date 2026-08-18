-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceEvidenceStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceEvidenceFormat" AS ENUM ('PDF', 'JPEG', 'PNG', 'WEBP', 'HEIF');

-- CreateEnum
CREATE TYPE "PublicStorySubmissionMediaClearanceEvidenceRejectionReason" AS ENUM ('UNSUPPORTED_FORMAT', 'MIME_TYPE_MISMATCH', 'FILE_TOO_LARGE', 'CORRUPTED_FILE', 'PDF_ENCRYPTED', 'PDF_PAGE_LIMIT_EXCEEDED', 'PDF_UNSAFE_STRUCTURE', 'DIMENSIONS_EXCEEDED', 'MULTI_FRAME_UNSUPPORTED', 'PROCESSING_FAILED');

-- AlterTable
ALTER TABLE "public_story_submission_media_clearance" ADD COLUMN     "verificationEvidenceDocumentId" UUID;

-- CreateTable
CREATE TABLE "public_story_submission_media_clearance_evidence_document" (
    "id" UUID NOT NULL,
    "clearanceId" UUID NOT NULL,
    "replacesEvidenceDocumentId" UUID,
    "declaredFormat" "PublicStorySubmissionMediaClearanceEvidenceFormat" NOT NULL,
    "detectedFormat" "PublicStorySubmissionMediaClearanceEvidenceFormat",
    "technicalStatus" "PublicStorySubmissionMediaClearanceEvidenceStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "rejectionReason" "PublicStorySubmissionMediaClearanceEvidenceRejectionReason",
    "originalByteSize" INTEGER,
    "originalSha256" CHAR(64),
    "originalFilename" VARCHAR(255),
    "originalStorageKey" VARCHAR(240),
    "uploadAuthorizationNonceHash" CHAR(64),
    "pageCount" INTEGER,
    "processedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "binaryDeletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_submission_media_clearance_evidence_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_story_submission_media_clearance_evidence_review_page" (
    "id" UUID NOT NULL,
    "evidenceDocumentId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" VARCHAR(240) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_story_submission_media_clearance_evidence_review_pa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_evidence_document_c_idx" ON "public_story_submission_media_clearance_evidence_document"("clearanceId", "technicalStatus", "createdAt");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_evidence_document_r_idx" ON "public_story_submission_media_clearance_evidence_document"("replacesEvidenceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_clearance_evidence_document_i_key" ON "public_story_submission_media_clearance_evidence_document"("id", "version");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_evidence_review_pag_idx" ON "public_story_submission_media_clearance_evidence_review_page"("evidenceDocumentId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_submission_media_clearance_evidence_review_pag_key" ON "public_story_submission_media_clearance_evidence_review_page"("evidenceDocumentId", "ordinal");

-- CreateIndex
CREATE INDEX "public_story_submission_media_clearance_verificationEvidenc_idx" ON "public_story_submission_media_clearance"("verificationEvidenceDocumentId");

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance" ADD CONSTRAINT "public_story_submission_media_clearance_verificationEviden_fkey" FOREIGN KEY ("verificationEvidenceDocumentId") REFERENCES "public_story_submission_media_clearance_evidence_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance_evidence_document" ADD CONSTRAINT "clearance_evidence_document_clearance_id_fkey" FOREIGN KEY ("clearanceId") REFERENCES "public_story_submission_media_clearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance_evidence_document" ADD CONSTRAINT "clearance_evidence_document_replaces_id_fkey" FOREIGN KEY ("replacesEvidenceDocumentId") REFERENCES "public_story_submission_media_clearance_evidence_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_story_submission_media_clearance_evidence_review_page" ADD CONSTRAINT "public_story_submission_media_clearance_evidence_review_pa_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "public_story_submission_media_clearance_evidence_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
