CREATE TYPE "PublicationReleaseState" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "PublicationDiscoveryDisposition" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "PublicationSnapshotState" AS ENUM ('PUBLISHED', 'SUPERSEDED', 'WITHDRAWN');

ALTER TYPE "PublicationLifecycleDimension" ADD VALUE 'RELEASE_SNAPSHOT';
ALTER TYPE "PublicationLifecycleDimension" ADD VALUE 'DISCOVERY_DISPOSITION';
ALTER TYPE "PublicationLifecycleAction" ADD VALUE 'RELEASED';
ALTER TYPE "PublicationLifecycleAction" ADD VALUE 'WITHDRAWN';
ALTER TYPE "PublicationLifecycleAction" ADD VALUE 'ARCHIVED';

ALTER TABLE "publication"
  ADD COLUMN "slug" VARCHAR(160),
  ADD COLUMN "releaseState" "PublicationReleaseState" NOT NULL DEFAULT 'UNPUBLISHED',
  ADD COLUMN "discoveryDisposition" "PublicationDiscoveryDisposition" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "activeSnapshotId" UUID;

CREATE TABLE "publication_snapshot" (
  "id" UUID NOT NULL,
  "publicationId" UUID NOT NULL,
  "sourceRevisionId" UUID NOT NULL,
  "sourceContentHash" CHAR(64) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "payload" JSONB NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" "PublicationSnapshotState" NOT NULL DEFAULT 'PUBLISHED',
  CONSTRAINT "publication_snapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publication_snapshot_hash_format_check" CHECK ("sourceContentHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public_story_projection" (
  "id" UUID NOT NULL,
  "publicationId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "headline" TEXT NOT NULL,
  "deck" TEXT,
  "excerpt" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_story_projection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publication_slug_key" ON "publication"("slug");
CREATE UNIQUE INDEX "publication_activeSnapshotId_key" ON "publication"("activeSnapshotId");
CREATE INDEX "publication_releaseState_discoveryDisposition_idx" ON "publication"("releaseState", "discoveryDisposition");
CREATE INDEX "publication_snapshot_publicationId_activatedAt_idx" ON "publication_snapshot"("publicationId", "activatedAt");
CREATE INDEX "publication_snapshot_state_idx" ON "publication_snapshot"("state");
CREATE UNIQUE INDEX "public_story_projection_publicationId_key" ON "public_story_projection"("publicationId");
CREATE UNIQUE INDEX "public_story_projection_snapshotId_key" ON "public_story_projection"("snapshotId");
CREATE UNIQUE INDEX "public_story_projection_slug_key" ON "public_story_projection"("slug");

ALTER TABLE "publication_snapshot" ADD CONSTRAINT "publication_snapshot_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_snapshot" ADD CONSTRAINT "publication_snapshot_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "publication_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_activeSnapshotId_fkey" FOREIGN KEY ("activeSnapshotId") REFERENCES "publication_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public_story_projection" ADD CONSTRAINT "public_story_projection_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_story_projection" ADD CONSTRAINT "public_story_projection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "publication_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_publication_snapshot_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'publication_snapshot rows are immutable';
END;
$$;
CREATE TRIGGER "publication_snapshot_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "publication_snapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_publication_snapshot_mutation"();
