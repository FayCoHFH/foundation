/*
  Warnings:

  - You are about to drop the `featured_news_placement` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PlacementKey" AS ENUM ('HOME_HERO', 'HOME_FEATURED_STORY', 'HOME_FEATURED_NEWS', 'NEWS_FEATURED');

-- DropForeignKey
ALTER TABLE "featured_news_placement" DROP CONSTRAINT "featured_news_placement_changedByAdminUserId_fkey";

-- DropForeignKey
ALTER TABLE "featured_news_placement" DROP CONSTRAINT "featured_news_placement_publicationId_fkey";

-- AlterTable
ALTER TABLE "news_item" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public_news_projection" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "publication" ALTER COLUMN "slug" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "content_placement" (
    "id" UUID NOT NULL,
    "key" "PlacementKey" NOT NULL,
    "publicationId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAdminUserId" UUID NOT NULL,
    "updatedByAdminUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_placement_pkey" PRIMARY KEY ("id")
);

-- Preserve C3's selected News feature as an open-ended shared placement.
INSERT INTO "content_placement" (
    "id", "key", "publicationId", "startsAt", "createdByAdminUserId", "updatedByAdminUserId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), 'NEWS_FEATURED', "publicationId", "changedAt", "changedByAdminUserId", "changedByAdminUserId", "changedAt", "changedAt"
FROM "featured_news_placement";

-- DropTable
DROP TABLE "featured_news_placement";

-- CreateIndex
CREATE INDEX "content_placement_key_startsAt_idx" ON "content_placement"("key", "startsAt");

-- CreateIndex
CREATE INDEX "content_placement_publicationId_idx" ON "content_placement"("publicationId");

ALTER TABLE "content_placement"
  ADD CONSTRAINT "content_placement_window_check" CHECK ("endsAt" IS NULL OR "startsAt" < "endsAt");

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "content_placement"
  ADD CONSTRAINT "content_placement_no_overlapping_windows"
  EXCLUDE USING gist (
    "key" WITH =,
    tsrange("startsAt", COALESCE("endsAt", 'infinity'::timestamp), '[)') WITH &&
  );

-- AddForeignKey
ALTER TABLE "content_placement" ADD CONSTRAINT "content_placement_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_placement" ADD CONSTRAINT "content_placement_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_placement" ADD CONSTRAINT "content_placement_updatedByAdminUserId_fkey" FOREIGN KEY ("updatedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
