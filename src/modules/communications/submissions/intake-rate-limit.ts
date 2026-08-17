import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PublicStoryIntakeRateLimitScope } from "@/generated/prisma/client";

import {
  PUBLIC_STORY_INTAKE_RATE_LIMITS,
  type PublicStoryIntakeConfig,
} from "./intake-contract";
import { fingerprintPublicStoryIntakeValue } from "./intake-token";

type Transaction = Prisma.TransactionClient;

export type IntakeRateLimitInput = Readonly<{
  networkIdentity: string;
  normalizedEmail?: string;
  includeNetwork?: boolean;
  includeGlobal?: boolean;
}>;

export type IntakeRateLimitLimits = Readonly<{
  network: { limit: number; windowMs: number };
  email: { limit: number; windowMs: number };
  global: { limit: number; windowMs: number };
}>;

const defaultLimits = PUBLIC_STORY_INTAKE_RATE_LIMITS;

function windowStart(now: Date, windowMs: number) {
  return new Date(Math.floor(now.valueOf() / windowMs) * windowMs);
}

function scopeValue(scope: keyof IntakeRateLimitLimits) {
  return PublicStoryIntakeRateLimitScope[
    scope.toUpperCase() as Uppercase<typeof scope>
  ];
}

async function incrementBucket(
  transaction: Transaction,
  scope: keyof IntakeRateLimitLimits,
  keyHash: string,
  now: Date,
  limit: { limit: number; windowMs: number },
) {
  const startedAt = windowStart(now, limit.windowMs);
  const expiresAt = new Date(startedAt.valueOf() + limit.windowMs);
  const databaseScope = scopeValue(scope);
  const rows = await transaction.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "public_story_intake_rate_limit_bucket"
      ("id", "scope", "keyHash", "windowStartedAt", "expiresAt", "count", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), ${databaseScope}::"PublicStoryIntakeRateLimitScope", ${keyHash}, ${startedAt}, ${expiresAt}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("scope", "keyHash", "windowStartedAt")
    DO UPDATE SET "count" = "public_story_intake_rate_limit_bucket"."count" + 1,
                  "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count"
  `;
  return (rows[0]?.count ?? limit.limit + 1) <= limit.limit;
}

export async function consumePublicStoryIntakeRateLimits(
  transaction: Transaction,
  input: IntakeRateLimitInput,
  config: Pick<PublicStoryIntakeConfig, "secret">,
  now: Date,
  limits: IntakeRateLimitLimits = defaultLimits,
) {
  if (!config.secret)
    throw new Error("Intake rate-limit secret is unavailable.");
  const networkHash = fingerprintPublicStoryIntakeValue(
    "network",
    input.networkIdentity.slice(0, 512),
    config.secret,
  );
  const globalHash = fingerprintPublicStoryIntakeValue(
    "global",
    "public-story-submission",
    config.secret,
  );
  const allowedNetwork =
    input.includeNetwork === false
      ? true
      : await incrementBucket(
          transaction,
          "network",
          networkHash,
          now,
          limits.network,
        );
  const allowedGlobal =
    input.includeGlobal === false
      ? true
      : await incrementBucket(
          transaction,
          "global",
          globalHash,
          now,
          limits.global,
        );
  let allowedEmail = true;
  if (input.normalizedEmail) {
    const emailHash = fingerprintPublicStoryIntakeValue(
      "email",
      input.normalizedEmail,
      config.secret,
    );
    allowedEmail = await incrementBucket(
      transaction,
      "email",
      emailHash,
      now,
      limits.email,
    );
  }
  return allowedNetwork && allowedEmail && allowedGlobal;
}

export async function cleanupExpiredPublicStoryIntakeArtifacts(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = 100,
) {
  const [buckets, tokens] = await Promise.all([
    prisma.publicStoryIntakeRateLimitBucket.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      take: Math.min(Math.max(batchSize, 1), 100),
    }),
    prisma.publicStoryIntakeTokenUse.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      take: Math.min(Math.max(batchSize, 1), 100),
    }),
  ]);
  const [bucketResult, tokenResult] = await prisma.$transaction([
    prisma.publicStoryIntakeRateLimitBucket.deleteMany({
      where: { id: { in: buckets.map(({ id }) => id) } },
    }),
    prisma.publicStoryIntakeTokenUse.deleteMany({
      where: { id: { in: tokens.map(({ id }) => id) } },
    }),
  ]);
  return {
    rateLimitBuckets: bucketResult.count,
    tokenUses: tokenResult.count,
  };
}
