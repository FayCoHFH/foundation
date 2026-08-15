import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Capability } from "@/platform/auth/capabilities";
import { AuthorizationError } from "@/platform/errors/app-error";
import {
  approveNews,
  createNews,
  getFeaturedNews,
  getLatestNews,
  getPublicNewsBySlug,
  newsDocumentFromPlainText,
  releaseNews,
  saveNewsRevision,
  sendNewsForApproval,
  setFeaturedNews,
  submitNews,
  withdrawNews,
} from "@/modules/communications/news";
import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";
const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});
type Actor = { adminUserId: string; capabilities: readonly Capability[] };
async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID(),
    role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
      include: { permissions: { include: { permission: true } } },
    });
  const user = await prisma.user.create({
    data: {
      id: `c3-${suffix}`,
      name: "C3",
      email: `c3-${suffix}@example.org`,
      emailVerified: true,
      workspaceDomain: "example.org",
    },
  });
  const admin = await prisma.adminUser.create({
    data: { authUserId: user.id, status: "ACTIVE" },
  });
  await prisma.userRole.create({
    data: { adminUserId: admin.id, roleId: role.id },
  });
  return {
    adminUserId: admin.id,
    capabilities: role.permissions.map(
      ({ permission }) => permission.key as Capability,
    ),
  };
}
const candidate = (headline: string, expiresAt: Date | null = null) => ({
  headline,
  summary: "A concise public News summary.",
  body: newsDocumentFromPlainText("A concise public News update."),
  expiresAt,
});
beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({ where: { key: "contributor" } });
});
describe("C3 News domain", () => {
  it("releases an immutable projection, derives expiry, and disables an expired feature", async () => {
    const contributor = await actor("contributor"),
      editor = await actor("editor"),
      manager = await actor("communications-manager");
    const created = await createNews(
      prisma,
      contributor,
      candidate("News release"),
    );
    const submitted = await submitNews(prisma, contributor, {
      newsId: created.newsId,
      expectedVersion: created.version,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const pending = await sendNewsForApproval(prisma, editor, {
      newsId: created.newsId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveNews(prisma, manager, {
      newsId: created.newsId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const released = await releaseNews(prisma, manager, {
      newsId: created.newsId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `news-${randomUUID()}`,
    });
    const publicNews = await getPublicNewsBySlug(prisma, released.slug!);
    expect(publicNews?.headline).toBe("News release");
    await setFeaturedNews(prisma, manager, released.newsId);
    expect((await getFeaturedNews(prisma))?.headline).toBe("News release");
    const expired = await saveNewsRevision(prisma, contributor, {
      newsId: released.newsId,
      expectedVersion: released.version,
      ...candidate("Expired release", new Date("2000-01-01T00:00:00.000Z")),
    });
    const submitted2 = await submitNews(prisma, contributor, {
      newsId: expired.newsId,
      expectedVersion: expired.version,
      expectedContentHash: expired.currentRevision.contentHash,
    });
    const pending2 = await sendNewsForApproval(prisma, editor, {
      newsId: expired.newsId,
      expectedVersion: submitted2.version,
      expectedContentHash: submitted2.currentRevision.contentHash,
    });
    const approved2 = await approveNews(prisma, manager, {
      newsId: expired.newsId,
      expectedVersion: pending2.version,
      expectedContentHash: pending2.currentRevision.contentHash,
    });
    await releaseNews(prisma, manager, {
      newsId: approved2.newsId,
      expectedVersion: approved2.version,
      expectedContentHash: approved2.currentRevision.contentHash,
      slug: released.slug!,
    });
    expect(await getFeaturedNews(prisma)).toBeNull();
    expect(
      (await getLatestNews(prisma)).some((item) => item.slug === released.slug),
    ).toBe(false);
    expect((await getPublicNewsBySlug(prisma, released.slug!))?.headline).toBe(
      "Expired release",
    );
    await withdrawNews(prisma, manager, {
      newsId: released.newsId,
      expectedVersion: approved2.version + 1,
      reason: "Test withdrawal",
    });
    expect(await getPublicNewsBySlug(prisma, released.slug!)).toBeNull();
  });

  it("denies News and Featured News mutations to an administrator without those capabilities", async () => {
    const platformAdmin = await actor("platform-admin");
    await expect(
      createNews(prisma, platformAdmin, candidate("Unauthorized News")),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      setFeaturedNews(prisma, platformAdmin, null),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
