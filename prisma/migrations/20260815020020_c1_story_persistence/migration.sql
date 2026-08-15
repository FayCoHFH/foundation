-- CreateEnum
CREATE TYPE "PublicationKind" AS ENUM ('STORY', 'NEWS');

-- CreateEnum
CREATE TYPE "PublicationWorkflowState" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'PENDING_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "PublicationLifecycleDimension" AS ENUM ('CANDIDATE_WORKFLOW');

-- CreateEnum
CREATE TYPE "PublicationLifecycleAction" AS ENUM ('DRAFT_CREATED', 'REVISION_CREATED', 'OWNER_ASSIGNED', 'SUBMITTED', 'CHANGES_REQUESTED', 'SENT_FOR_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "PublicationApprovalDecision" AS ENUM ('APPROVED');

-- CreateTable
CREATE TABLE "publication" (
    "id" UUID NOT NULL,
    "kind" "PublicationKind" NOT NULL,
    "workflowState" "PublicationWorkflowState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentRevisionId" UUID,
    "approvedRevisionId" UUID,
    "approvedContentHash" CHAR(64),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_responsibility" (
    "publicationId" UUID NOT NULL,
    "editorialOwnerAdminUserId" UUID NOT NULL,
    "assignedReviewerAdminUserId" UUID,
    "assignedApproverAdminUserId" UUID,
    "changedByAdminUserId" UUID NOT NULL,
    "reassignmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_responsibility_pkey" PRIMARY KEY ("publicationId")
);

-- CreateTable
CREATE TABLE "publication_revision" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "parentRevisionId" UUID,
    "headline" TEXT NOT NULL,
    "deck" TEXT,
    "excerpt" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "contentHashVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByAdminUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_lifecycle_transition" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "dimension" "PublicationLifecycleDimension" NOT NULL,
    "action" "PublicationLifecycleAction" NOT NULL,
    "fromState" "PublicationWorkflowState",
    "toState" "PublicationWorkflowState",
    "revisionId" UUID,
    "contentHash" CHAR(64),
    "actorAdminUserId" UUID,
    "reason" TEXT,
    "correlationId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_lifecycle_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_approval" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "contentHashVersion" INTEGER NOT NULL DEFAULT 1,
    "decision" "PublicationApprovalDecision" NOT NULL DEFAULT 'APPROVED',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedByAdminUserId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overrideReason" TEXT,

    CONSTRAINT "publication_approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publication_currentRevisionId_key" ON "publication"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "publication_approvedRevisionId_key" ON "publication"("approvedRevisionId");

-- CreateIndex
CREATE INDEX "publication_kind_workflowState_idx" ON "publication"("kind", "workflowState");

-- CreateIndex
CREATE INDEX "publication_createdById_idx" ON "publication"("createdById");

-- Enables one-statement optimistic authoring updates against an exact version.
CREATE UNIQUE INDEX "publication_id_version_key" ON "publication"("id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "story_publicationId_key" ON "story"("publicationId");

-- CreateIndex
CREATE INDEX "publication_responsibility_editorialOwnerAdminUserId_idx" ON "publication_responsibility"("editorialOwnerAdminUserId");

-- CreateIndex
CREATE INDEX "publication_responsibility_assignedReviewerAdminUserId_idx" ON "publication_responsibility"("assignedReviewerAdminUserId");

-- CreateIndex
CREATE INDEX "publication_responsibility_assignedApproverAdminUserId_idx" ON "publication_responsibility"("assignedApproverAdminUserId");

-- CreateIndex
CREATE INDEX "publication_revision_publicationId_createdAt_idx" ON "publication_revision"("publicationId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_revision_createdByAdminUserId_idx" ON "publication_revision"("createdByAdminUserId");

-- CreateIndex
CREATE INDEX "publication_revision_parentRevisionId_idx" ON "publication_revision"("parentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "publication_revision_publicationId_number_key" ON "publication_revision"("publicationId", "number");

-- CreateIndex
CREATE INDEX "publication_lifecycle_transition_publicationId_occurredAt_idx" ON "publication_lifecycle_transition"("publicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "publication_lifecycle_transition_revisionId_idx" ON "publication_lifecycle_transition"("revisionId");

-- CreateIndex
CREATE INDEX "publication_lifecycle_transition_actorAdminUserId_idx" ON "publication_lifecycle_transition"("actorAdminUserId");

-- CreateIndex
CREATE INDEX "publication_lifecycle_transition_correlationId_idx" ON "publication_lifecycle_transition"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "publication_approval_revisionId_key" ON "publication_approval"("revisionId");

-- CreateIndex
CREATE INDEX "publication_approval_publicationId_approvedAt_idx" ON "publication_approval"("publicationId", "approvedAt");

-- CreateIndex
CREATE INDEX "publication_approval_approvedByAdminUserId_idx" ON "publication_approval"("approvedByAdminUserId");

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "publication_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId") REFERENCES "publication_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story" ADD CONSTRAINT "story_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_responsibility" ADD CONSTRAINT "publication_responsibility_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_responsibility" ADD CONSTRAINT "publication_responsibility_editorialOwnerAdminUserId_fkey" FOREIGN KEY ("editorialOwnerAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_responsibility" ADD CONSTRAINT "publication_responsibility_assignedReviewerAdminUserId_fkey" FOREIGN KEY ("assignedReviewerAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_responsibility" ADD CONSTRAINT "publication_responsibility_assignedApproverAdminUserId_fkey" FOREIGN KEY ("assignedApproverAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_responsibility" ADD CONSTRAINT "publication_responsibility_changedByAdminUserId_fkey" FOREIGN KEY ("changedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_revision" ADD CONSTRAINT "publication_revision_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_revision" ADD CONSTRAINT "publication_revision_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_revision" ADD CONSTRAINT "publication_revision_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_lifecycle_transition" ADD CONSTRAINT "publication_lifecycle_transition_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_lifecycle_transition" ADD CONSTRAINT "publication_lifecycle_transition_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_lifecycle_transition" ADD CONSTRAINT "publication_lifecycle_transition_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_approval" ADD CONSTRAINT "publication_approval_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_approval" ADD CONSTRAINT "publication_approval_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_approval" ADD CONSTRAINT "publication_approval_approvedByAdminUserId_fkey" FOREIGN KEY ("approvedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- C1 invariant checks. Future publication kinds must add their own typed root
-- validation rather than weakening these shared authoring constraints.
ALTER TABLE "publication"
  ADD CONSTRAINT "publication_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "publication_revision"
  ADD CONSTRAINT "publication_revision_number_positive_check" CHECK ("number" > 0),
  ADD CONSTRAINT "publication_revision_schema_version_positive_check" CHECK ("schemaVersion" > 0),
  ADD CONSTRAINT "publication_revision_hash_version_positive_check" CHECK ("contentHashVersion" > 0),
  ADD CONSTRAINT "publication_revision_hash_format_check" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "publication_approval"
  ADD CONSTRAINT "publication_approval_hash_version_positive_check" CHECK ("contentHashVersion" > 0),
  ADD CONSTRAINT "publication_approval_hash_format_check" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');

-- Stored revision bodies are immutable evidence. A corrected draft is always
-- a successor row; retention/deletion policy must use a future audited path.
CREATE FUNCTION "prevent_publication_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'publication_revision rows are immutable';
END;
$$;

CREATE TRIGGER "publication_revision_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "publication_revision"
FOR EACH ROW EXECUTE FUNCTION "prevent_publication_revision_mutation"();
