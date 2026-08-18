CREATE TYPE "DonorViewDestinationPurpose" AS ENUM (
  'GENERAL_DONATE',
  'CAMPAIGN_DONATE',
  'GENERAL_VOLUNTEER',
  'VOLUNTEER_EVENT'
);

CREATE TYPE "DonorViewDestinationStatus" AS ENUM (
  'UNVERIFIED',
  'VERIFIED',
  'INACTIVE'
);

CREATE TYPE "EngagementDestinationProvider" AS ENUM ('DONORVIEW');

CREATE TABLE "donorview_destination" (
  "id" UUID NOT NULL,
  "provider" "EngagementDestinationProvider" NOT NULL DEFAULT 'DONORVIEW',
  "purpose" "DonorViewDestinationPurpose" NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "pageReference" VARCHAR(160),
  "status" "DonorViewDestinationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verifiedAt" TIMESTAMP(3),
  "verifiedByAdminUserId" UUID,
  "lastReviewedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "donorview_destination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "engagement_configuration" (
  "id" VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
  "generalDonateDestinationId" UUID,
  "generalVolunteerDestinationId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "engagement_configuration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "campaign_action" ALTER COLUMN "destination" DROP NOT NULL;
ALTER TABLE "campaign_action" ADD COLUMN "destinationId" UUID;
ALTER TABLE "public_campaign_action" ALTER COLUMN "destination" DROP NOT NULL;
ALTER TABLE "public_campaign_action" ADD COLUMN "destinationId" UUID;

CREATE INDEX "donorview_destination_purpose_status_idx" ON "donorview_destination"("purpose", "status");
CREATE INDEX "donorview_destination_verifiedByAdminUserId_idx" ON "donorview_destination"("verifiedByAdminUserId");
CREATE INDEX "campaign_action_destinationId_idx" ON "campaign_action"("destinationId");
CREATE INDEX "public_campaign_action_destinationId_idx" ON "public_campaign_action"("destinationId");
CREATE UNIQUE INDEX "engagement_configuration_generalDonateDestinationId_key" ON "engagement_configuration"("generalDonateDestinationId");
CREATE UNIQUE INDEX "engagement_configuration_generalVolunteerDestinationId_key" ON "engagement_configuration"("generalVolunteerDestinationId");

ALTER TABLE "donorview_destination"
  ADD CONSTRAINT "donorview_destination_verifiedByAdminUserId_fkey"
  FOREIGN KEY ("verifiedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engagement_configuration"
  ADD CONSTRAINT "engagement_configuration_generalDonateDestinationId_fkey"
  FOREIGN KEY ("generalDonateDestinationId") REFERENCES "donorview_destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "engagement_configuration"
  ADD CONSTRAINT "engagement_configuration_generalVolunteerDestinationId_fkey"
  FOREIGN KEY ("generalVolunteerDestinationId") REFERENCES "donorview_destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_action"
  ADD CONSTRAINT "campaign_action_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "donorview_destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public_campaign_action"
  ADD CONSTRAINT "public_campaign_action_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "donorview_destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
