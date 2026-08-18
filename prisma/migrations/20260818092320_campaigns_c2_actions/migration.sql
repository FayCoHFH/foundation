-- CreateEnum
CREATE TYPE "CampaignActionType" AS ENUM ('DONATE', 'VOLUNTEER', 'LEARN_MORE');

-- CreateTable
CREATE TABLE "public_campaign_action" (
    "id" UUID NOT NULL,
    "projectionId" UUID NOT NULL,
    "actionType" "CampaignActionType" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "destination" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "public_campaign_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_action" (
    "id" UUID NOT NULL,
    "campaignRevisionId" UUID NOT NULL,
    "actionType" "CampaignActionType" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "destination" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "campaign_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_campaign_action_projectionId_actionType_idx" ON "public_campaign_action"("projectionId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "public_campaign_action_projectionId_sortOrder_key" ON "public_campaign_action"("projectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "campaign_action_campaignRevisionId_actionType_idx" ON "campaign_action"("campaignRevisionId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_action_campaignRevisionId_sortOrder_key" ON "campaign_action"("campaignRevisionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public_campaign_action" ADD CONSTRAINT "public_campaign_action_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "public_campaign_projection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_action" ADD CONSTRAINT "campaign_action_campaignRevisionId_fkey" FOREIGN KEY ("campaignRevisionId") REFERENCES "campaign_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
