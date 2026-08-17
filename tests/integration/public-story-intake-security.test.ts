import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PublicStoryIntakeRateLimitScope } from "@/generated/prisma/client";
import { cleanupExpiredPublicStoryIntakeArtifacts } from "@/modules/communications/submissions";
import { submitPublicStorySubmission } from "@/modules/communications/submissions/intake-service";
import type { PublicStoryIntakeConfig } from "@/modules/communications/submissions/intake-contract";
import {
  issuePublicStorySubmissionToken,
  hashPublicStorySubmissionToken,
} from "@/modules/communications/submissions/intake-token";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

const secret = "c6b1b-integration-intake-secret-that-is-at-least-32-bytes";
const config: PublicStoryIntakeConfig = {
  enabled: true,
  secret,
  privacyNoticeVersion: "public-story-v1",
  appOrigin: "http://127.0.0.1:3000",
  appEnv: "test",
  isVercel: false,
};

const permissiveRateLimits = {
  network: { limit: 1_000, windowMs: 60 * 60 * 1_000 },
  email: { limit: 1_000, windowMs: 24 * 60 * 60 * 1_000 },
  global: { limit: 1_000, windowMs: 60 * 60 * 1_000 },
} as const;

const baseTime = new Date("2040-08-16T12:00:01.000Z");

function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    origin: config.appOrigin,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "content-type": "multipart/form-data; boundary=c6b1b",
    ...overrides,
  };
}

function formFor(
  token: string,
  label: string,
  overrides: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("formToken", token);
  form.set("honeypot", "");
  form.set("submitterName", `C6B1B ${label}`);
  form.set("submitterEmail", `${label.toLowerCase()}@example.org`);
  form.set("relationshipToHabitat", "Community volunteer");
  form.set(
    "storyText",
    "This is a sufficiently long plain-text story about Habitat and our neighborhood.",
  );
  form.set("contactConsent", "true");
  form.set("privacyNoticeVersion", "public-story-v1");
  form.set("editorialReviewAcknowledged", "true");
  form.set("sensitiveDataWarningAcknowledged", "true");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function tokenAt(time: Date) {
  return issuePublicStorySubmissionToken(
    { secret, privacyNoticeVersion: "public-story-v1" },
    new Date(time.valueOf() - 1_000),
  );
}

async function submit(
  label: string,
  time = baseTime,
  overrides: Record<string, string> = {},
  options: Record<string, unknown> = {},
) {
  const token = tokenAt(time);
  return submitPublicStorySubmission(
    formFor(token, label, overrides),
    { headers: requestHeaders() },
    {
      prisma,
      config,
      now: () => time,
      cleanupArtifacts: false,
      rateLimits: permissiveRateLimits,
      networkIdentity: `integration-network-${label}`,
      ...options,
    },
  );
}

describe("C6B-1B Public Story Submission intake security PostgreSQL boundary", () => {
  beforeAll(async () => {
    await prisma.publicStoryIntakeTokenUse.deleteMany();
    await prisma.publicStoryIntakeRateLimitBucket.deleteMany();
    await prisma.publicStorySubmission.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps disabled intake unavailable without persistence", async () => {
    const before = await prisma.publicStorySubmission.count();
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      new Date(baseTime.valueOf() - 1_000),
    );
    const result = await submitPublicStorySubmission(
      formFor(token, "Disabled"),
      { headers: requestHeaders() },
      {
        prisma,
        config: { ...config, enabled: false },
        now: () => baseTime,
      },
    );
    expect(result.code).toBe("UNAVAILABLE");
    expect(await prisma.publicStorySubmission.count()).toBe(before);
    expect(await prisma.publicStoryIntakeTokenUse.count()).toBe(0);
  });

  it("accepts one valid trusted request through the authoritative domain service", async () => {
    const before = {
      submissions: await prisma.publicStorySubmission.count(),
      publications: await prisma.publication.count(),
      stories: await prisma.story.count(),
      news: await prisma.newsItem.count(),
    };
    const result = await submit("ValidOne");
    expect(result).toEqual({
      code: "ACCEPTED",
      message: "Thanks for sharing your story.",
    });
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { submitterName: "C6B1B ValidOne" },
    });
    expect(row).toMatchObject({
      status: "RECEIVED",
      privacyNoticeVersion: "public-story-v1",
      contactConsent: true,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
    });
    expect(await prisma.publicStorySubmission.count()).toBe(
      before.submissions + 1,
    );
    expect(await prisma.publication.count()).toBe(before.publications);
    expect(await prisma.story.count()).toBe(before.stories);
    expect(await prisma.newsItem.count()).toBe(before.news);
    expect(Object.keys(result)).toEqual(["code", "message"]);
    const tokenUses = await prisma.publicStoryIntakeTokenUse.findMany();
    expect(tokenUses).toHaveLength(1);
    expect(tokenUses[0]?.submissionId).toBe(row.id);
    expect(tokenUses[0]?.tokenHash).not.toContain("ValidOne");
  });

  it("rejects foreign/malformed contexts, unsafe shapes, and oversized input before persistence", async () => {
    const cases = [
      { headers: requestHeaders({ origin: "https://foreign.example" }) },
      { headers: requestHeaders({ "sec-fetch-site": "cross-site" }) },
      { headers: requestHeaders({ "sec-fetch-mode": "cors" }) },
      { headers: requestHeaders({ "content-type": "application/json" }) },
      { headers: requestHeaders({ "content-length": "999999" }) },
    ];
    const before = await prisma.publicStorySubmission.count();
    for (const [index, testCase] of cases.entries()) {
      const result = await submitPublicStorySubmission(
        formFor(tokenAt(baseTime), `Context${index}`),
        { headers: testCase.headers },
        {
          prisma,
          config,
          now: () => baseTime,
          cleanupArtifacts: false,
          rateLimits: permissiveRateLimits,
          networkIdentity: `context-${index}`,
        },
      );
      expect(result.code).toBe("SECURITY_REJECTED");
    }
    const unknown = formFor(tokenAt(baseTime), "Unknown", { unexpected: "x" });
    const oversized = formFor(tokenAt(baseTime), "Oversized", {
      storyText: "x".repeat(50_000),
    });
    for (const form of [unknown, oversized]) {
      const result = await submitPublicStorySubmission(
        form,
        { headers: requestHeaders() },
        {
          prisma,
          config,
          now: () => baseTime,
          cleanupArtifacts: false,
          rateLimits: permissiveRateLimits,
          networkIdentity: randomUUID(),
        },
      );
      expect(result.code).toBe("SECURITY_REJECTED");
    }
    expect(await prisma.publicStorySubmission.count()).toBe(before);
  });

  it("rejects token tampering, expiry, future issuance, stale privacy, too-fast completion, and honeypots", async () => {
    const valid = tokenAt(baseTime);
    const tampered = `${valid.slice(0, -1)}x`;
    const expiredTime = new Date("2040-08-16T15:00:01.000Z");
    const futureTime = new Date("2040-08-16T12:00:10.000Z");
    const futureToken = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      futureTime,
    );
    const expiredToken = tokenAt(baseTime);
    const staleToken = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v2" },
      new Date(baseTime.valueOf() - 1_000),
    );
    const cases = [
      [tampered, baseTime, {}],
      [expiredToken, expiredTime, {}],
      [futureToken, baseTime, {}],
      [staleToken, baseTime, { privacyNoticeVersion: "public-story-v2" }],
      [valid, new Date(baseTime.valueOf() - 1_000), {}],
      [valid, baseTime, { honeypot: "filled" }],
    ] as const;
    const before = await prisma.publicStorySubmission.count();
    for (const [index, [token, time, overrides]] of cases.entries()) {
      const result = await submitPublicStorySubmission(
        formFor(token, `Token${index}`, overrides),
        { headers: requestHeaders() },
        {
          prisma,
          config,
          now: () => time,
          cleanupArtifacts: false,
          rateLimits: permissiveRateLimits,
          networkIdentity: `token-${index}`,
        },
      );
      expect(result.code).toBe("SECURITY_REJECTED");
    }
    expect(await prisma.publicStorySubmission.count()).toBe(before);
  });

  it("keeps domain validation actionable without consuming a token", async () => {
    const token = tokenAt(baseTime);
    const result = await submitPublicStorySubmission(
      formFor(token, "Invalid", {
        submitterEmail: "not-an-email",
        contactConsent: "false",
      }),
      { headers: requestHeaders() },
      {
        prisma,
        config,
        now: () => baseTime,
        cleanupArtifacts: false,
        rateLimits: permissiveRateLimits,
        networkIdentity: "validation-network",
      },
    );
    expect(result).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(result).toHaveProperty("fieldErrors.submitterEmail");
    expect(
      await prisma.publicStoryIntakeTokenUse.findUnique({
        where: { tokenHash: hashPublicStorySubmissionToken(token) },
      }),
    ).toBeNull();
  });

  it("enforces network, email, and global thresholds without raw identifiers", async () => {
    const limits = {
      network: { limit: 2, windowMs: 60 * 60 * 1_000 },
      email: { limit: 2, windowMs: 24 * 60 * 60 * 1_000 },
      global: { limit: 2, windowMs: 60 * 60 * 1_000 },
    } as const;
    const networkTime = new Date("2040-08-17T12:00:01.000Z");
    const networkResults = await Promise.all(
      ["NetworkA", "NetworkB", "NetworkC"].map((label) =>
        submitPublicStorySubmission(
          formFor(tokenAt(networkTime), label),
          { headers: requestHeaders() },
          {
            prisma,
            config,
            now: () => networkTime,
            cleanupArtifacts: false,
            rateLimits: {
              ...limits,
              email: { limit: 100, windowMs: 86_400_000 },
              global: { limit: 100, windowMs: 3_600_000 },
            },
            networkIdentity: "same-network",
          },
        ),
      ),
    );
    expect(networkResults.map(({ code }) => code)).toEqual([
      "ACCEPTED",
      "ACCEPTED",
      "RATE_LIMITED",
    ]);

    const emailTime = new Date("2040-08-18T12:00:01.000Z");
    const emailResults = await Promise.all(
      ["EmailA", "EmailB", "EmailC"].map((label) =>
        submitPublicStorySubmission(
          formFor(tokenAt(emailTime), label, {
            submitterEmail: "same@example.org",
          }),
          { headers: requestHeaders() },
          {
            prisma,
            config,
            now: () => emailTime,
            cleanupArtifacts: false,
            rateLimits: {
              network: { limit: 100, windowMs: 3_600_000 },
              email: limits.email,
              global: { limit: 100, windowMs: 3_600_000 },
            },
            networkIdentity: `email-network-${label}`,
          },
        ),
      ),
    );
    expect(emailResults.map(({ code }) => code).sort()).toEqual(
      ["ACCEPTED", "ACCEPTED", "RATE_LIMITED"].sort(),
    );

    const globalTime = new Date("2040-08-19T12:00:01.000Z");
    const globalResults = await Promise.all(
      ["GlobalA", "GlobalB", "GlobalC"].map((label) =>
        submitPublicStorySubmission(
          formFor(tokenAt(globalTime), label),
          { headers: requestHeaders() },
          {
            prisma,
            config,
            now: () => globalTime,
            cleanupArtifacts: false,
            rateLimits: {
              network: { limit: 100, windowMs: 3_600_000 },
              email: { limit: 100, windowMs: 86_400_000 },
              global: limits.global,
            },
            networkIdentity: `global-network-${label}`,
          },
        ),
      ),
    );
    expect(globalResults.map(({ code }) => code).sort()).toEqual(
      ["ACCEPTED", "ACCEPTED", "RATE_LIMITED"].sort(),
    );

    const buckets = await prisma.publicStoryIntakeRateLimitBucket.findMany();
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.every(({ keyHash }) => keyHash.length === 64)).toBe(true);
    expect(
      buckets.every(({ keyHash }) => !keyHash.includes("same@example.org")),
    ).toBe(true);
    expect(
      buckets.every(({ keyHash }) => !keyHash.includes("same-network")),
    ).toBe(true);
  });

  it("makes successful token replay idempotent", async () => {
    const token = tokenAt(new Date("2040-08-20T12:00:01.000Z"));
    const form = formFor(token, "Replay");
    const context = { headers: requestHeaders() };
    const options = {
      prisma,
      config,
      now: () => new Date("2040-08-20T12:00:01.000Z"),
      cleanupArtifacts: false,
      rateLimits: permissiveRateLimits,
      networkIdentity: "replay-network",
    } as const;
    const first = await submitPublicStorySubmission(form, context, options);
    const second = await submitPublicStorySubmission(form, context, options);
    expect(first.code).toBe("ACCEPTED");
    expect(second).toEqual({
      code: "DUPLICATE_ACCEPTED",
      message: "Thanks for sharing your story.",
    });
    expect(
      await prisma.publicStorySubmission.count({
        where: { submitterName: "C6B1B Replay" },
      }),
    ).toBe(1);
  });

  it("allows at most one submission for concurrent replay", async () => {
    const time = new Date("2040-08-21T12:00:01.000Z");
    const form = formFor(tokenAt(time), "Concurrent");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        submitPublicStorySubmission(
          form,
          { headers: requestHeaders() },
          {
            prisma,
            config,
            now: () => time,
            cleanupArtifacts: false,
            rateLimits: permissiveRateLimits,
            networkIdentity: "concurrent-network",
          },
        ),
      ),
    );
    expect(results.filter(({ code }) => code === "ACCEPTED")).toHaveLength(1);
    expect(
      results.filter(({ code }) => code === "DUPLICATE_ACCEPTED"),
    ).toHaveLength(4);
    expect(
      await prisma.publicStorySubmission.count({
        where: { submitterName: "C6B1B Concurrent" },
      }),
    ).toBe(1);
  });

  it("rolls back token consumption and submission when the receipt audit fails", async () => {
    const time = new Date("2040-08-22T12:00:01.000Z");
    const token = tokenAt(time);
    const result = await submitPublicStorySubmission(
      formFor(token, "AuditRollback"),
      { headers: requestHeaders() },
      {
        prisma,
        config,
        now: () => time,
        cleanupArtifacts: false,
        rateLimits: permissiveRateLimits,
        networkIdentity: "audit-rollback",
        auditWriter: async () => {
          throw new Error("audit unavailable");
        },
      },
    );
    expect(result.code).toBe("UNAVAILABLE");
    expect(
      await prisma.publicStorySubmission.count({
        where: { submitterName: "C6B1B AuditRollback" },
      }),
    ).toBe(0);
    expect(
      await prisma.publicStoryIntakeTokenUse.findUnique({
        where: { tokenHash: hashPublicStorySubmissionToken(token) },
      }),
    ).toBeNull();
  });

  it("does not create a submission when token-use persistence fails", async () => {
    const time = new Date("2040-08-22T13:00:01.000Z");
    const token = tokenAt(time);
    const result = await submitPublicStorySubmission(
      formFor(token, "TokenUseRollback"),
      { headers: requestHeaders() },
      {
        prisma,
        config,
        now: () => time,
        cleanupArtifacts: false,
        rateLimits: permissiveRateLimits,
        networkIdentity: "token-use-rollback",
        tokenUseWriter: async () => {
          throw new Error("token-use unavailable");
        },
      },
    );
    expect(result.code).toBe("UNAVAILABLE");
    expect(
      await prisma.publicStorySubmission.count({
        where: { submitterName: "C6B1B TokenUseRollback" },
      }),
    ).toBe(0);
    expect(
      await prisma.publicStoryIntakeTokenUse.findUnique({
        where: { tokenHash: hashPublicStorySubmissionToken(token) },
      }),
    ).toBeNull();
  });

  it("cleans expired security artifacts without deleting submissions", async () => {
    const now = new Date("2040-08-23T12:00:00.000Z");
    await prisma.publicStoryIntakeRateLimitBucket.create({
      data: {
        scope: PublicStoryIntakeRateLimitScope.NETWORK,
        keyHash: "a".repeat(64),
        windowStartedAt: new Date(now.valueOf() - 3_600_000),
        expiresAt: new Date(now.valueOf() - 1),
        count: 1,
      },
    });
    await prisma.publicStoryIntakeTokenUse.create({
      data: {
        tokenHash: "b".repeat(64),
        expiresAt: new Date(now.valueOf() - 1),
        consumedAt: new Date(now.valueOf() - 2),
      },
    });
    const before = await prisma.publicStorySubmission.count();
    const result = await cleanupExpiredPublicStoryIntakeArtifacts(prisma, now);
    expect(result.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(result.tokenUses).toBeGreaterThanOrEqual(1);
    expect(await prisma.publicStoryIntakeRateLimitBucket.count()).toBe(0);
    expect(await prisma.publicStoryIntakeTokenUse.count()).toBe(0);
    expect(await prisma.publicStorySubmission.count()).toBe(before);
  });
});
