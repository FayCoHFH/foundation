-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('FUNDRAISING', 'MATCHING_GIFT', 'VOLUNTEER', 'AWARENESS', 'SPONSORSHIP', 'SPECIAL_INITIATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PublicationKind" ADD VALUE 'CAMPAIGN';

-- CreateTable
CREATE TABLE "public_campaign_projection" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(320) NOT NULL,
    "body" JSONB NOT NULL,
    "campaignType" "CampaignType" NOT NULL,
    "campaignStatus" "CampaignStatus" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "goalStatement" VARCHAR(240),
    "goalAmountCents" BIGINT,
    "progressAmountCents" BIGINT,
    "currencyCode" CHAR(3),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_campaign_projection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_campaign_fact" (
    "id" UUID NOT NULL,
    "projectionId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "value" VARCHAR(240) NOT NULL,
    "unit" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "public_campaign_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_campaign_project_reference" (
    "id" UUID NOT NULL,
    "projectionId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "public_campaign_project_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_revision" (
    "id" UUID NOT NULL,
    "publicationRevisionId" UUID NOT NULL,
    "campaignType" "CampaignType" NOT NULL,
    "campaignStatus" "CampaignStatus" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "goalStatement" VARCHAR(240),
    "goalAmountCents" BIGINT,
    "progressAmountCents" BIGINT,
    "currencyCode" CHAR(3),

    CONSTRAINT "campaign_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_fact" (
    "id" UUID NOT NULL,
    "campaignRevisionId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "value" VARCHAR(240) NOT NULL,
    "unit" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "campaign_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_project" (
    "id" UUID NOT NULL,
    "campaignRevisionId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "campaign_project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_projection_publicationId_key" ON "public_campaign_projection"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_projection_snapshotId_key" ON "public_campaign_projection"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_projection_slug_key" ON "public_campaign_projection"("slug");

-- CreateIndex
CREATE INDEX "public_campaign_projection_campaignType_publishedAt_idx" ON "public_campaign_projection"("campaignType", "publishedAt");

-- CreateIndex
CREATE INDEX "public_campaign_projection_campaignStatus_publishedAt_idx" ON "public_campaign_projection"("campaignStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "public_campaign_projection_publishedAt_idx" ON "public_campaign_projection"("publishedAt");

-- CreateIndex
CREATE INDEX "public_campaign_fact_projectionId_sortOrder_idx" ON "public_campaign_fact"("projectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_fact_projectionId_sortOrder_key" ON "public_campaign_fact"("projectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "public_campaign_project_reference_projectId_idx" ON "public_campaign_project_reference"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_project_reference_projectionId_projectId_key" ON "public_campaign_project_reference"("projectionId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_project_reference_projectionId_sortOrder_key" ON "public_campaign_project_reference"("projectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_publicationId_key" ON "campaign"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_revision_publicationRevisionId_key" ON "campaign_revision"("publicationRevisionId");

-- CreateIndex
CREATE INDEX "campaign_fact_campaignRevisionId_sortOrder_idx" ON "campaign_fact"("campaignRevisionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_fact_campaignRevisionId_sortOrder_key" ON "campaign_fact"("campaignRevisionId", "sortOrder");

-- CreateIndex
CREATE INDEX "campaign_project_projectId_idx" ON "campaign_project"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_project_campaignRevisionId_projectId_key" ON "campaign_project"("campaignRevisionId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_project_campaignRevisionId_sortOrder_key" ON "campaign_project"("campaignRevisionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public_campaign_projection" ADD CONSTRAINT "public_campaign_projection_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_campaign_projection" ADD CONSTRAINT "public_campaign_projection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "publication_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_campaign_fact" ADD CONSTRAINT "public_campaign_fact_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "public_campaign_projection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_campaign_project_reference" ADD CONSTRAINT "public_campaign_project_reference_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "public_campaign_projection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_campaign_project_reference" ADD CONSTRAINT "public_campaign_project_reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_revision" ADD CONSTRAINT "campaign_revision_publicationRevisionId_fkey" FOREIGN KEY ("publicationRevisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_fact" ADD CONSTRAINT "campaign_fact_campaignRevisionId_fkey" FOREIGN KEY ("campaignRevisionId") REFERENCES "campaign_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_project" ADD CONSTRAINT "campaign_project_campaignRevisionId_fkey" FOREIGN KEY ("campaignRevisionId") REFERENCES "campaign_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_project" ADD CONSTRAINT "campaign_project_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
