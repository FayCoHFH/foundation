-- CreateEnum
CREATE TYPE "SiteNoticeSeverity" AS ENUM ('INFO', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "SiteNoticeTargetArea" AS ENUM ('SITE_WIDE', 'HOMEPAGE');

-- CreateEnum
CREATE TYPE "SiteNoticeLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "site_notice" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "severity" "SiteNoticeSeverity" NOT NULL,
    "targetArea" "SiteNoticeTargetArea" NOT NULL,
    "ctaLabel" VARCHAR(80),
    "ctaUrl" VARCHAR(2048),
    "lifecycle" "SiteNoticeLifecycle" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAdminUserId" UUID NOT NULL,
    "updatedByAdminUserId" UUID NOT NULL,
    "publishedByAdminUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "withdrawnByAdminUserId" UUID,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_notice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "site_notice"
  ADD CONSTRAINT "site_notice_window_check"
  CHECK (
    ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt")
    AND (
      "lifecycle" = 'DRAFT'
      OR ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL)
    )
  ),
  ADD CONSTRAINT "site_notice_cta_pair_check"
  CHECK (("ctaLabel" IS NULL) = ("ctaUrl" IS NULL)),
  ADD CONSTRAINT "site_notice_lifecycle_fields_check"
  CHECK (
    (
      "lifecycle" = 'DRAFT'
      AND "publishedAt" IS NULL
      AND "publishedByAdminUserId" IS NULL
      AND "withdrawnAt" IS NULL
      AND "withdrawnByAdminUserId" IS NULL
    )
    OR (
      "lifecycle" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND "publishedByAdminUserId" IS NOT NULL
      AND "withdrawnAt" IS NULL
      AND "withdrawnByAdminUserId" IS NULL
    )
    OR (
      "lifecycle" = 'WITHDRAWN'
      AND "publishedAt" IS NOT NULL
      AND "publishedByAdminUserId" IS NOT NULL
      AND "withdrawnAt" IS NOT NULL
      AND "withdrawnByAdminUserId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "site_notice_version_check" CHECK ("version" > 0);

-- CreateIndex
CREATE INDEX "site_notice_targetArea_lifecycle_startsAt_endsAt_idx" ON "site_notice"("targetArea", "lifecycle", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "site_notice_lifecycle_updatedAt_id_idx" ON "site_notice"("lifecycle", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_notice_id_version_key" ON "site_notice"("id", "version");

-- AddForeignKey
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_updatedByAdminUserId_fkey" FOREIGN KEY ("updatedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_publishedByAdminUserId_fkey" FOREIGN KEY ("publishedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_withdrawnByAdminUserId_fkey" FOREIGN KEY ("withdrawnByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
