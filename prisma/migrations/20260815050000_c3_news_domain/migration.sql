-- C3: typed News roots, public projection, and the single NEWS_FEATURED placement.
ALTER TABLE "publication_revision"
  ADD COLUMN "newsSummary" TEXT,
  ADD COLUMN "newsExpiresAt" TIMESTAMP(3);

CREATE TABLE "news_item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "publicationId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "news_item_publicationId_key" UNIQUE ("publicationId"),
  CONSTRAINT "news_item_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "public_news_projection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "publicationId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "headline" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_news_projection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_news_projection_publicationId_key" UNIQUE ("publicationId"),
  CONSTRAINT "public_news_projection_snapshotId_key" UNIQUE ("snapshotId"),
  CONSTRAINT "public_news_projection_slug_key" UNIQUE ("slug"),
  CONSTRAINT "public_news_projection_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "public_news_projection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "publication_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "public_news_projection_expiresAt_publishedAt_idx" ON "public_news_projection"("expiresAt", "publishedAt");

CREATE TABLE "featured_news_placement" (
  "id" TEXT NOT NULL DEFAULT 'NEWS_FEATURED',
  "publicationId" UUID NOT NULL,
  "changedByAdminUserId" UUID NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "featured_news_placement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "featured_news_placement_publicationId_key" UNIQUE ("publicationId"),
  CONSTRAINT "featured_news_placement_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "featured_news_placement_changedByAdminUserId_fkey" FOREIGN KEY ("changedByAdminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "featured_news_placement_id_check" CHECK ("id" = 'NEWS_FEATURED')
);
