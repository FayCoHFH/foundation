-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('NEW_HOME', 'HOME_REPAIR', 'REHABILITATION', 'ACCESSIBILITY', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PublicationKind" ADD VALUE 'PROJECT';

-- CreateTable
CREATE TABLE "public_project_projection" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(320) NOT NULL,
    "body" JSONB NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "projectStatus" "ProjectStatus" NOT NULL,
    "community" VARCHAR(120) NOT NULL,
    "county" VARCHAR(120) NOT NULL,
    "publicArea" VARCHAR(160),
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_project_projection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_project_impact_fact" (
    "id" UUID NOT NULL,
    "projectionId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "value" VARCHAR(240) NOT NULL,
    "unit" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "public_project_impact_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_revision" (
    "id" UUID NOT NULL,
    "publicationRevisionId" UUID NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "projectStatus" "ProjectStatus" NOT NULL,
    "community" VARCHAR(120) NOT NULL,
    "county" VARCHAR(120) NOT NULL,
    "publicArea" VARCHAR(160),
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),

    CONSTRAINT "project_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_impact_fact" (
    "id" UUID NOT NULL,
    "projectRevisionId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "value" VARCHAR(240) NOT NULL,
    "unit" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "project_impact_fact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_project_projection_publicationId_key" ON "public_project_projection"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "public_project_projection_snapshotId_key" ON "public_project_projection"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "public_project_projection_slug_key" ON "public_project_projection"("slug");

-- CreateIndex
CREATE INDEX "public_project_projection_projectType_publishedAt_idx" ON "public_project_projection"("projectType", "publishedAt");

-- CreateIndex
CREATE INDEX "public_project_projection_projectStatus_publishedAt_idx" ON "public_project_projection"("projectStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "public_project_projection_publishedAt_idx" ON "public_project_projection"("publishedAt");

-- CreateIndex
CREATE INDEX "public_project_impact_fact_projectionId_sortOrder_idx" ON "public_project_impact_fact"("projectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "public_project_impact_fact_projectionId_sortOrder_key" ON "public_project_impact_fact"("projectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "project_publicationId_key" ON "project"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "project_revision_publicationRevisionId_key" ON "project_revision"("publicationRevisionId");

-- CreateIndex
CREATE INDEX "project_impact_fact_projectRevisionId_sortOrder_idx" ON "project_impact_fact"("projectRevisionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "project_impact_fact_projectRevisionId_sortOrder_key" ON "project_impact_fact"("projectRevisionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public_project_projection" ADD CONSTRAINT "public_project_projection_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_project_projection" ADD CONSTRAINT "public_project_projection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "publication_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_project_impact_fact" ADD CONSTRAINT "public_project_impact_fact_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "public_project_projection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revision" ADD CONSTRAINT "project_revision_publicationRevisionId_fkey" FOREIGN KEY ("publicationRevisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_impact_fact" ADD CONSTRAINT "project_impact_fact_projectRevisionId_fkey" FOREIGN KEY ("projectRevisionId") REFERENCES "project_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
