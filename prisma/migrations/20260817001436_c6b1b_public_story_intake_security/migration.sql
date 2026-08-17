-- CreateEnum
CREATE TYPE "PublicStoryIntakeRateLimitScope" AS ENUM ('NETWORK', 'EMAIL', 'GLOBAL');

-- CreateTable
CREATE TABLE "public_story_intake_rate_limit_bucket" (
    "id" UUID NOT NULL,
    "scope" "PublicStoryIntakeRateLimitScope" NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_story_intake_rate_limit_bucket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public_story_intake_rate_limit_bucket"
  ADD CONSTRAINT "public_story_intake_rate_limit_bucket_count_check" CHECK ("count" >= 0),
  ADD CONSTRAINT "public_story_intake_rate_limit_bucket_expiry_check" CHECK ("expiresAt" > "windowStartedAt");

-- CreateTable
CREATE TABLE "public_story_intake_token_use" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" UUID,

    CONSTRAINT "public_story_intake_token_use_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public_story_intake_token_use"
  ADD CONSTRAINT "public_story_intake_token_use_expiry_check" CHECK ("expiresAt" >= "consumedAt");

-- CreateIndex
CREATE INDEX "public_story_intake_rate_limit_bucket_expiresAt_idx" ON "public_story_intake_rate_limit_bucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_intake_rate_limit_bucket_scope_keyHash_windowS_key" ON "public_story_intake_rate_limit_bucket"("scope", "keyHash", "windowStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_intake_token_use_tokenHash_key" ON "public_story_intake_token_use"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "public_story_intake_token_use_submissionId_key" ON "public_story_intake_token_use"("submissionId");

-- CreateIndex
CREATE INDEX "public_story_intake_token_use_expiresAt_idx" ON "public_story_intake_token_use"("expiresAt");

-- AddForeignKey
ALTER TABLE "public_story_intake_token_use" ADD CONSTRAINT "public_story_intake_token_use_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public_story_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
