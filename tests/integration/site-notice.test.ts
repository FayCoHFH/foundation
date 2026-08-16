import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSiteNotice,
  getEffectiveSiteNotices,
  getSiteNotice,
  listSiteNotices,
  publishSiteNotice,
  updateSiteNotice,
  withdrawSiteNotice,
} from "@/modules/communications/notices";
import {
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import type { Capability } from "@/platform/auth/capabilities";
import {
  AuthorizationError,
  ConcurrencyError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

type Actor = {
  adminUserId: string;
  capabilities: readonly Capability[];
};

const clock = new Date("2040-08-16T12:00:00.000Z");
const startsAt = new Date("2040-08-16T13:00:00.000Z");
const endsAt = new Date("2040-08-16T14:00:00.000Z");

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6a1-${randomUUID()}`,
      name: `C6A1 ${role.name}`,
      email: `c6a1-${randomUUID()}@example.org`,
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

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: "Office operational notice",
    message: "The office has a temporary schedule change.",
    severity: SiteNoticeSeverity.INFO,
    targetArea: SiteNoticeTargetArea.SITE_WIDE,
    startsAt,
    endsAt,
    ...overrides,
  } as const;
}

describe("C6A-1 Site Notice PostgreSQL domain", () => {
  let manager: Actor;
  let denied: Actor;

  beforeAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "site_notice" CASCADE`;
    manager = await actor("communications-manager");
    denied = await actor("platform-admin");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates drafts only for authorized active administrators", async () => {
    const notice = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Draft closure",
        startsAt: null,
        endsAt: null,
      }),
    );
    expect(notice.lifecycle).toBe(SiteNoticeLifecycle.DRAFT);
    expect(notice.status).toBe("DRAFT");
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
        evaluationTime: startsAt,
      }),
    ).toEqual([]);
    await expect(
      createSiteNotice(prisma, denied, input()),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          targetType: "SiteNotice",
          targetId: notice.id,
          action: "site_notice.created",
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("updates authorized drafts with optimistic concurrency and preserves stale state", async () => {
    const original = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Original" }),
    );
    const updated = await updateSiteNotice(prisma, manager, {
      ...input({ title: "Updated", severity: SiteNoticeSeverity.IMPORTANT }),
      noticeId: original.id,
      expectedVersion: original.version,
    });
    expect(updated.version).toBe(original.version + 1);
    expect(updated.title).toBe("Updated");
    await expect(
      updateSiteNotice(prisma, manager, {
        ...input({ title: "Stale write" }),
        noticeId: original.id,
        expectedVersion: original.version,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      getSiteNotice(prisma, manager, original.id, clock),
    ).resolves.toMatchObject({
      title: "Updated",
      version: updated.version,
    });
    await expect(
      prisma.auditEvent.count({
        where: {
          targetType: "SiteNotice",
          targetId: original.id,
          action: "site_notice.updated",
        },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back a draft update when audit writing fails", async () => {
    const original = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Before audit failure" }),
    );
    await expect(
      updateSiteNotice(
        prisma,
        manager,
        {
          ...input({ title: "Must roll back" }),
          noticeId: original.id,
          expectedVersion: original.version,
        },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    await expect(
      getSiteNotice(prisma, manager, original.id, clock),
    ).resolves.toMatchObject({
      title: "Before audit failure",
      version: original.version,
    });
  });

  it("publishes only complete valid drafts and records publication evidence", async () => {
    const notice = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Publishable closure",
        message: "The office is closed for maintenance.",
        ctaLabel: "Read details",
        ctaUrl: "/news",
      }),
    );
    const published = await publishSiteNotice(prisma, manager, {
      noticeId: notice.id,
      expectedVersion: notice.version,
      at: clock,
    });
    expect(published.lifecycle).toBe(SiteNoticeLifecycle.PUBLISHED);
    expect(published.version).toBe(notice.version + 1);
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          targetType: "SiteNotice",
          targetId: notice.id,
          action: "site_notice.published",
        },
      }),
    ).resolves.toMatchObject({ outcome: "SUCCEEDED" });

    for (const invalid of [
      input({ title: "" }),
      input({ message: "" }),
      input({ startsAt: null, endsAt }),
    ]) {
      const draft = await createSiteNotice(prisma, manager, invalid);
      await expect(
        publishSiteNotice(prisma, manager, {
          noticeId: draft.id,
          expectedVersion: draft.version,
          at: clock,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    for (const invalid of [
      input({ startsAt: endsAt, endsAt: startsAt }),
      input({ ctaLabel: "Details", ctaUrl: null }),
      input({ ctaLabel: "Details", ctaUrl: "javascript:alert(1)" }),
    ]) {
      await expect(
        createSiteNotice(prisma, manager, invalid),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      publishSiteNotice(prisma, denied, {
        noticeId: notice.id,
        expectedVersion: published.version,
        at: clock,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      publishSiteNotice(prisma, manager, {
        noticeId: notice.id,
        expectedVersion: notice.version,
        at: clock,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("rolls back a publish when audit writing fails", async () => {
    const draft = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Publish rollback" }),
    );
    await expect(
      publishSiteNotice(
        prisma,
        manager,
        { noticeId: draft.id, expectedVersion: draft.version, at: clock },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    await expect(
      getSiteNotice(prisma, manager, draft.id, clock),
    ).resolves.toMatchObject({
      lifecycle: SiteNoticeLifecycle.DRAFT,
      version: draft.version,
    });
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          targetType: "SiteNotice",
          targetId: draft.id,
          action: "site_notice.published",
        },
      }),
    ).resolves.toBeNull();
  });

  it("uses half-open public effectiveness, target filtering, severity ordering, and bounded DTOs", async () => {
    const urgent = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Urgent site notice",
        severity: SiteNoticeSeverity.URGENT,
        startsAt: new Date("2040-08-16T11:00:00Z"),
        endsAt: new Date("2040-08-16T15:00:00Z"),
      }),
    );
    const important = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Important homepage notice",
        severity: SiteNoticeSeverity.IMPORTANT,
        targetArea: SiteNoticeTargetArea.HOMEPAGE,
        startsAt: new Date("2040-08-16T11:30:00Z"),
        endsAt: new Date("2040-08-16T15:00:00Z"),
      }),
    );
    const info = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Info site notice",
        startsAt: new Date("2040-08-16T11:45:00Z"),
        endsAt: new Date("2040-08-16T15:00:00Z"),
      }),
    );
    await Promise.all(
      [urgent, important, info].map((notice) =>
        publishSiteNotice(prisma, manager, {
          noticeId: notice.id,
          expectedVersion: notice.version,
          at: clock,
        }),
      ),
    );
    const siteWide = await getEffectiveSiteNotices(
      prisma,
      SiteNoticeTargetArea.SITE_WIDE,
      { evaluationTime: clock, limit: 1 },
    );
    expect(siteWide).toHaveLength(1);
    expect(siteWide[0]).toMatchObject({
      id: urgent.id,
      severity: SiteNoticeSeverity.URGENT,
    });
    expect(Object.keys(siteWide[0] ?? {}).sort()).toEqual([
      "ctaLabel",
      "ctaUrl",
      "endsAt",
      "id",
      "message",
      "severity",
      "startsAt",
      "targetArea",
      "title",
    ]);
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.HOMEPAGE, {
        evaluationTime: clock,
      }),
    ).toMatchObject([{ id: important.id }]);
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
        evaluationTime: new Date("2040-08-16T10:59:59Z"),
      }),
    ).toEqual([]);
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
        evaluationTime: new Date("2040-08-16T15:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("withdraws without deleting content, is immediately ineffective, and rejects stale or repeated withdrawal", async () => {
    const notice = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Withdraw me" }),
    );
    const published = await publishSiteNotice(prisma, manager, {
      noticeId: notice.id,
      expectedVersion: notice.version,
      at: clock,
    });
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
        evaluationTime: startsAt,
      }),
    ).toContainEqual(expect.objectContaining({ id: notice.id }));
    const withdrawn = await withdrawSiteNotice(prisma, manager, {
      noticeId: notice.id,
      expectedVersion: published.version,
      at: clock,
    });
    expect(withdrawn.lifecycle).toBe(SiteNoticeLifecycle.WITHDRAWN);
    expect(withdrawn.startsAt).toEqual(startsAt);
    expect(withdrawn.endsAt).toEqual(endsAt);
    expect(
      await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
        evaluationTime: startsAt,
      }),
    ).not.toContainEqual(expect.objectContaining({ id: notice.id }));
    await expect(
      withdrawSiteNotice(prisma, manager, {
        noticeId: notice.id,
        expectedVersion: published.version,
        at: clock,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      withdrawSiteNotice(prisma, manager, {
        noticeId: notice.id,
        expectedVersion: withdrawn.version,
        at: clock,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    await expect(
      withdrawSiteNotice(prisma, denied, {
        noticeId: notice.id,
        expectedVersion: withdrawn.version,
        at: clock,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          targetType: "SiteNotice",
          targetId: notice.id,
          action: "site_notice.withdrawn",
        },
      }),
    ).resolves.toMatchObject({ outcome: "SUCCEEDED" });
  });

  it("rolls back withdrawal when audit writing fails", async () => {
    const notice = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Withdrawal rollback" }),
    );
    const published = await publishSiteNotice(prisma, manager, {
      noticeId: notice.id,
      expectedVersion: notice.version,
      at: clock,
    });
    await expect(
      withdrawSiteNotice(
        prisma,
        manager,
        { noticeId: notice.id, expectedVersion: published.version, at: clock },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    await expect(
      getSiteNotice(prisma, manager, notice.id, clock),
    ).resolves.toMatchObject({
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      version: published.version,
    });
  });

  it("returns bounded deterministic administrative records with derived statuses", async () => {
    const draft = await createSiteNotice(
      prisma,
      manager,
      input({ title: "Admin draft", startsAt: null, endsAt: null }),
    );
    const upcoming = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Admin upcoming",
        startsAt: new Date("2040-08-17T12:00:00Z"),
        endsAt: new Date("2040-08-18T12:00:00Z"),
      }),
    );
    const active = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Admin active",
        startsAt: new Date("2040-08-16T11:00:00Z"),
        endsAt: new Date("2040-08-16T13:00:00Z"),
      }),
    );
    const expired = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Admin expired",
        startsAt: new Date("2040-08-15T11:00:00Z"),
        endsAt: new Date("2040-08-15T13:00:00Z"),
      }),
    );
    const withdrawalCandidate = await createSiteNotice(
      prisma,
      manager,
      input({
        title: "Admin withdrawal candidate",
        startsAt: new Date("2040-08-15T14:00:00Z"),
        endsAt: new Date("2040-08-15T15:00:00Z"),
      }),
    );
    for (const notice of [upcoming, active, expired, withdrawalCandidate]) {
      await publishSiteNotice(prisma, manager, {
        noticeId: notice.id,
        expectedVersion: notice.version,
        at: clock,
      });
    }
    const withdrawn = await withdrawSiteNotice(prisma, manager, {
      noticeId: withdrawalCandidate.id,
      expectedVersion: withdrawalCandidate.version + 1,
      at: clock,
    });
    expect(withdrawn.status).toBe("WITHDRAWN");
    const records = await listSiteNotices(prisma, manager, {
      evaluationTime: clock,
      limit: 6,
    });
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: draft.id, status: "DRAFT" }),
        expect.objectContaining({ id: upcoming.id, status: "UPCOMING" }),
        expect.objectContaining({ id: active.id, status: "ACTIVE" }),
        expect.objectContaining({ id: expired.id, status: "EXPIRED" }),
        expect.objectContaining({
          id: withdrawalCandidate.id,
          status: "WITHDRAWN",
        }),
      ]),
    );
    expect(records[0]?.updatedAt.valueOf()).toBeGreaterThanOrEqual(
      records[1]?.updatedAt.valueOf() ?? 0,
    );
    expect(records[0]).not.toHaveProperty("audit");
    await expect(
      listSiteNotices(prisma, denied, { evaluationTime: clock }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("does not mutate state during public reads and enforces database window/CTA constraints", async () => {
    const before = await prisma.siteNotice.count();
    await getEffectiveSiteNotices(prisma, SiteNoticeTargetArea.SITE_WIDE, {
      evaluationTime: clock,
    });
    expect(await prisma.siteNotice.count()).toBe(before);
    await expect(
      prisma.siteNotice.create({
        data: {
          title: "Invalid persisted window",
          message: "Invalid",
          severity: SiteNoticeSeverity.INFO,
          targetArea: SiteNoticeTargetArea.SITE_WIDE,
          lifecycle: SiteNoticeLifecycle.PUBLISHED,
          startsAt: endsAt,
          endsAt: startsAt,
          createdByAdminUserId: manager.adminUserId,
          updatedByAdminUserId: manager.adminUserId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.siteNotice.create({
        data: {
          title: "Invalid CTA pair",
          message: "Invalid",
          severity: SiteNoticeSeverity.INFO,
          targetArea: SiteNoticeTargetArea.SITE_WIDE,
          ctaLabel: "Only label",
          createdByAdminUserId: manager.adminUserId,
          updatedByAdminUserId: manager.adminUserId,
        },
      }),
    ).rejects.toThrow();
  });
});
