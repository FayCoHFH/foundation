import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import type { PrismaClient } from "@/generated/prisma/client";
import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const c3MigrationName = "20260815050000_c3_news_domain";
const upgradeDatabaseName = "habitat_c42b_upgrade_test";
const upgradeShadowDatabaseName = "habitat_c42b_upgrade_shadow_test";
const databaseTimestamp = "2025-01-15 12:00:00.000";
const resolveAt = new Date("2025-01-16T12:00:00.000Z");

type CommandEnvironment = NodeJS.ProcessEnv & {
  DATABASE_URL: string;
  DIRECT_DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
  ALLOW_DESTRUCTIVE_TEST_DATABASE: string;
  PRISMA_REQUIRE_DIRECT_DATABASE_URL: string;
  PRISMA_REQUIRE_SHADOW_DATABASE_URL: string;
};

const target = assertDestructiveTestDatabaseSafety();
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowDatabaseUrl) {
  throw new Error(
    "SHADOW_DATABASE_URL is required for the C4.2B upgrade test.",
  );
}

const shadowUrl = new URL(shadowDatabaseUrl);
if (
  !["localhost", "127.0.0.1", "::1"].includes(shadowUrl.hostname) ||
  decodeURIComponent(shadowUrl.pathname.slice(1)) !== upgradeShadowDatabaseName
) {
  throw new Error(
    `C4.2B upgrade shadow must be loopback database ${upgradeShadowDatabaseName}.`,
  );
}
if (target.databaseName !== upgradeDatabaseName) {
  throw new Error(
    `C4.2B upgrade target must be database ${upgradeDatabaseName}.`,
  );
}

const commandEnvironment: CommandEnvironment = {
  ...process.env,
  DATABASE_URL: target.databaseUrl,
  DIRECT_DATABASE_URL: target.directDatabaseUrl,
  SHADOW_DATABASE_URL: shadowDatabaseUrl,
  ALLOW_DESTRUCTIVE_TEST_DATABASE: "true",
  PRISMA_REQUIRE_DIRECT_DATABASE_URL: "true",
  PRISMA_REQUIRE_SHADOW_DATABASE_URL: "true",
};

let c3ConfigDirectory: string | undefined;
let prisma: PrismaClient | undefined;

function quoteIdentifier(value: string) {
  if (!/^habitat_[a-z0-9_]+_test$/.test(value)) {
    throw new Error(`Refusing unexpected disposable database name: ${value}`);
  }
  return `"${value}"`;
}

function adminDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = "/postgres";
  parsed.search = "";
  return parsed.toString();
}

async function recreateDatabase(databaseUrl: string, databaseName: string) {
  const admin = new Client({ connectionString: adminDatabaseUrl(databaseUrl) });
  await admin.connect();
  try {
    const identifier = quoteIdentifier(databaseName);
    await admin.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${identifier}`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase(databaseUrl: string, databaseName: string) {
  const admin = new Client({ connectionString: adminDatabaseUrl(databaseUrl) });
  await admin.connect();
  try {
    await admin.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
    );
  } finally {
    await admin.end();
  }
}

async function run(command: string, args: string[], env = commandEnvironment) {
  const result = await execFileAsync(command, args, {
    cwd: repositoryRoot,
    env,
    maxBuffer: 8 * 1024 * 1024,
  });
  return `${result.stdout}\n${result.stderr}`;
}

async function createC3Config() {
  c3ConfigDirectory = await mkdtemp(join(tmpdir(), "habitat-c42b-prisma-"));
  const migrationsDirectory = join(c3ConfigDirectory, "migrations");
  await mkdir(migrationsDirectory, { recursive: true });
  await cp(
    join(repositoryRoot, "prisma/migrations/migration_lock.toml"),
    join(migrationsDirectory, "migration_lock.toml"),
  );

  const sourceMigrations = join(repositoryRoot, "prisma/migrations");
  const migrationEntries = [
    "20260815003142_slice_1_foundation",
    "20260815020020_c1_story_persistence",
    "20260815033000_c2_publication_release",
    c3MigrationName,
  ];
  for (const migration of migrationEntries) {
    await cp(
      join(sourceMigrations, migration),
      join(migrationsDirectory, migration),
      { recursive: true },
    );
  }

  const configPath = join(c3ConfigDirectory, "prisma.c3.config.ts");
  await writeFile(
    configPath,
    `import { defineConfig } from "prisma/config";\n\nconst directDatabaseUrl = process.env.DIRECT_DATABASE_URL;\nif (!directDatabaseUrl) throw new Error("DIRECT_DATABASE_URL is required.");\n\nexport default defineConfig({\n  schema: ${JSON.stringify(join(repositoryRoot, "prisma/schema.prisma"))},\n  migrations: { path: ${JSON.stringify(migrationsDirectory)} },\n  datasource: { url: directDatabaseUrl },\n});\n`,
  );
  return configPath;
}

async function insertC3Fixture() {
  const client = new Client({ connectionString: target.directDatabaseUrl });
  await client.connect();
  const actorAuthId = `c42b-upgrade-auth-${randomUUID()}`;
  const actorId = randomUUID();
  const publicationId = randomUUID();
  const newsItemId = randomUUID();
  const revisionId = randomUUID();
  const snapshotId = randomUUID();
  const projectionId = randomUUID();
  const contentHash = "a".repeat(64);
  const slug = "c42b-preserved-featured-news";
  const body = {
    schemaVersion: 1,
    root: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A preserved C3 News body." }],
        },
      ],
    },
  };
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "user" ("id", "name", "email", "emailVerified", "workspaceDomain", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'example.org', $4, $4)`,
      [
        actorAuthId,
        "C4.2B Upgrade Actor",
        `${actorAuthId}@example.org`,
        databaseTimestamp,
      ],
    );
    await client.query(
      `INSERT INTO "admin_user" ("id", "authUserId", "status", "statusChangedAt", "version", "createdAt", "updatedAt")
       VALUES ($1, $2, 'ACTIVE', $3, 1, $3, $3)`,
      [actorId, actorAuthId, databaseTimestamp],
    );
    await client.query(
      `INSERT INTO "publication" ("id", "kind", "workflowState", "version", "approvedContentHash", "slug", "releaseState", "discoveryDisposition", "createdById", "createdAt", "updatedAt")
       VALUES ($1, 'NEWS', 'APPROVED', 2, $2, $3, 'PUBLISHED', 'ACTIVE', $4, $5, $5)`,
      [publicationId, contentHash, slug, actorId, databaseTimestamp],
    );
    await client.query(
      `INSERT INTO "publication_revision" ("id", "publicationId", "number", "headline", "excerpt", "body", "schemaVersion", "contentHash", "contentHashVersion", "createdByAdminUserId", "createdAt", "newsSummary", "newsExpiresAt")
       VALUES ($1, $2, 1, $3, $4, $5::jsonb, 1, $6, 1, $7, $8, $9, NULL)`,
      [
        revisionId,
        publicationId,
        "C3 preserved News",
        "A News item carried across the placement migration.",
        JSON.stringify(body),
        contentHash,
        actorId,
        databaseTimestamp,
        "A preserved C3 summary.",
      ],
    );
    await client.query(
      `UPDATE "publication"
       SET "currentRevisionId" = $1, "approvedRevisionId" = $1
       WHERE "id" = $2`,
      [revisionId, publicationId],
    );
    await client.query(
      `INSERT INTO "publication_snapshot" ("id", "publicationId", "sourceRevisionId", "sourceContentHash", "slug", "payload", "activatedAt", "state")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'PUBLISHED')`,
      [
        snapshotId,
        publicationId,
        revisionId,
        contentHash,
        slug,
        JSON.stringify({
          headline: "C3 preserved News",
          summary: "A preserved C3 summary.",
          body,
        }),
        databaseTimestamp,
      ],
    );
    await client.query(
      `UPDATE "publication" SET "activeSnapshotId" = $1 WHERE "id" = $2`,
      [snapshotId, publicationId],
    );
    await client.query(
      `INSERT INTO "news_item" ("id", "publicationId", "createdAt") VALUES ($1, $2, $3)`,
      [newsItemId, publicationId, databaseTimestamp],
    );
    await client.query(
      `INSERT INTO "public_news_projection" ("id", "publicationId", "snapshotId", "slug", "headline", "summary", "body", "publishedAt", "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NULL, $8)`,
      [
        projectionId,
        publicationId,
        snapshotId,
        slug,
        "C3 preserved News",
        "A preserved C3 summary.",
        JSON.stringify(body),
        databaseTimestamp,
      ],
    );
    await client.query(
      `INSERT INTO "featured_news_placement" ("id", "publicationId", "changedByAdminUserId", "changedAt")
       VALUES ('NEWS_FEATURED', $1, $2, $3)`,
      [publicationId, actorId, databaseTimestamp],
    );
    await client.query("COMMIT");
    return { actorId, publicationId, projectionId, slug };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function assertC3FixtureAndSafety(publicationId: string) {
  const client = new Client({ connectionString: target.directDatabaseUrl });
  await client.connect();
  try {
    const legacy = await client.query(
      `SELECT "id", "publicationId", "changedByAdminUserId",
              to_char("changedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "changedAtText"
       FROM "featured_news_placement" WHERE "id" = 'NEWS_FEATURED'`,
    );
    expect(legacy.rows).toHaveLength(1);
    expect(legacy.rows[0].publicationId).toBe(publicationId);
    expect(legacy.rows[0].changedAtText).toBe("2025-01-15T12:00:00.000");

    const foreignKey = await client.query(
      `SELECT 1
       FROM pg_constraint
       WHERE conname = 'featured_news_placement_publicationId_fkey'
         AND conrelid = 'featured_news_placement'::regclass`,
    );
    expect(foreignKey.rows).toHaveLength(1);

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM "featured_news_placement" WHERE "id" = 'NEWS_FEATURED'`,
    );
    await expect(
      client.query(
        `INSERT INTO "featured_news_placement" ("id", "publicationId", "changedByAdminUserId", "changedAt")
         VALUES ('NEWS_FEATURED', $1, $2, $3)`,
        [randomUUID(), legacy.rows[0].changedByAdminUserId, databaseTimestamp],
      ),
    ).rejects.toThrow();
    await client.query("ROLLBACK");
    return legacy.rows[0].changedAtText as string;
  } finally {
    await client.end();
  }
}

describe("C3-to-current Featured News placement upgrade", () => {
  let fixture: {
    actorId: string;
    publicationId: string;
    projectionId: string;
    slug: string;
    legacyChangedAtText: string;
  };

  beforeAll(async () => {
    await recreateDatabase(target.directDatabaseUrl, upgradeDatabaseName);
    await recreateDatabase(shadowDatabaseUrl, upgradeShadowDatabaseName);
    const c3ConfigPath = await createC3Config();

    const preflight = await run("pnpm", [
      "db:test:assert-migration-environment",
    ]);
    expect(preflight).toContain(
      `Validated disposable Prisma migration target ${upgradeDatabaseName} and separate shadow database.`,
    );

    const c3Deploy = await run("pnpm", [
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--config",
      c3ConfigPath,
    ]);
    expect(c3Deploy).toContain("4 migrations found");
    const c3Status = await run("pnpm", [
      "exec",
      "prisma",
      "migrate",
      "status",
      "--config",
      c3ConfigPath,
    ]);
    expect(c3Status).toContain("Database schema is up to date");

    const insertedFixture = await insertC3Fixture();
    fixture = {
      ...insertedFixture,
      legacyChangedAtText: await assertC3FixtureAndSafety(
        insertedFixture.publicationId,
      ),
    };
  }, 120_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (c3ConfigDirectory)
      await rm(c3ConfigDirectory, { recursive: true, force: true });
    await dropDatabase(target.directDatabaseUrl, upgradeDatabaseName);
    await dropDatabase(shadowDatabaseUrl, upgradeShadowDatabaseName);
  }, 120_000);

  it("converts the real C3 feature into one resolvable current placement", async () => {
    const migrationSql = await readFile(
      join(
        repositoryRoot,
        "prisma/migrations/20260815134212_c4_homepage_placements/migration.sql",
      ),
      "utf8",
    );
    expect(
      migrationSql.indexOf('INSERT INTO "content_placement"'),
    ).toBeGreaterThan(-1);
    expect(
      migrationSql.indexOf('INSERT INTO "content_placement"'),
    ).toBeLessThan(
      migrationSql.indexOf('DROP TABLE "featured_news_placement"'),
    );
    expect(migrationSql).toContain('FROM "featured_news_placement"');
    expect(migrationSql).toContain(
      '"publicationId", "changedAt", "changedByAdminUserId"',
    );

    const deploy = await run("pnpm", ["db:migrate:deploy"]);
    expect(deploy).toContain("7 migrations found");
    const status = await run("pnpm", ["db:migrate:status"]);
    expect(status).toContain("Database schema is up to date");

    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { getEffectivePlacement } =
      await import("@/modules/communications/placements/placement-service");
    const { getFeaturedNews } =
      await import("@/modules/communications/news/news-service");
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: target.databaseUrl }),
    });

    const placementCount = await prisma.contentPlacement.count({
      where: { key: "NEWS_FEATURED" },
    });
    expect(placementCount).toBe(1);
    const placements = await prisma.contentPlacement.findMany({
      where: { key: "NEWS_FEATURED" },
      orderBy: { startsAt: "asc" },
    });
    expect(placements).toHaveLength(1);
    const placement = await prisma.contentPlacement.findFirstOrThrow({
      where: { key: "NEWS_FEATURED" },
    });
    expect(placement.key).toBe("NEWS_FEATURED");
    expect(placement.publicationId).toBe(fixture.publicationId);
    expect(placement.endsAt).toBeNull();
    expect(placement.cancelledAt).toBeNull();
    expect(Number.isNaN(placement.startsAt.valueOf())).toBe(false);

    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: fixture.publicationId },
    });
    expect(publication.kind).toBe("NEWS");
    expect(publication.id).toBe(fixture.publicationId);

    const legacyTable = await prisma.$queryRawUnsafe<
      Array<{ exists: string | null }>
    >(`SELECT to_regclass('public.featured_news_placement')::text AS exists`);
    expect(legacyTable).toHaveLength(1);
    expect(legacyTable[0]?.exists).toBeNull();
    const currentTable = await prisma.$queryRawUnsafe<
      Array<{ exists: string | null }>
    >(`SELECT to_regclass('public.content_placement')::text AS exists`);
    expect(currentTable).toHaveLength(1);
    expect(currentTable[0]?.exists).toBe("content_placement");

    const migratedWindow = await prisma.$queryRawUnsafe<
      Array<{ startsAtText: string }>
    >(
      `SELECT to_char("startsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "startsAtText"
       FROM "content_placement" WHERE "key" = 'NEWS_FEATURED'`,
    );
    expect(migratedWindow).toHaveLength(1);
    expect(migratedWindow[0]?.startsAtText).toBe(fixture.legacyChangedAtText);

    const effective = await getEffectivePlacement(
      prisma,
      "NEWS_FEATURED",
      resolveAt,
    );
    expect(effective?.placement.publicationId).toBe(fixture.publicationId);
    expect(effective?.placement.startsAt.toISOString()).toBe(
      placement.startsAt.toISOString(),
    );
    expect(effective?.placement.endsAt).toBeNull();
    expect(effective?.news).toMatchObject({
      slug: fixture.slug,
      headline: "C3 preserved News",
      summary: "A preserved C3 summary.",
    });
    expect(Object.keys(effective?.news ?? {}).sort()).toEqual([
      "body",
      "expiresAt",
      "headline",
      "publishedAt",
      "slug",
      "summary",
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(effective?.news, "publicationId"),
    ).toBe(false);

    const featuredNews = await getFeaturedNews(prisma, resolveAt);
    expect(featuredNews).toMatchObject({
      slug: fixture.slug,
      headline: "C3 preserved News",
      summary: "A preserved C3 summary.",
    });
    expect(Object.keys(featuredNews ?? {}).sort()).toEqual([
      "body",
      "expiresAt",
      "headline",
      "publishedAt",
      "slug",
      "summary",
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(featuredNews, "publicationId"),
    ).toBe(false);

    const projection = await prisma.$queryRawUnsafe<
      Array<{ publicationId: string; id: string }>
    >(
      `SELECT "publicationId", "id" FROM "public_news_projection" WHERE "slug" = $1`,
      fixture.slug,
    );
    expect(projection).toHaveLength(1);
    expect(projection[0]?.publicationId).toBe(fixture.publicationId);
    expect(projection[0]?.id).toBe(fixture.projectionId);
  }, 120_000);
});
