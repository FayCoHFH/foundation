import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

import {
  compareEffectiveSiteNotices,
  deriveSiteNoticeStatus,
  SITE_NOTICE_ADMIN_LIMIT,
  SITE_NOTICE_ADMIN_MAX_LIMIT,
  SITE_NOTICE_PUBLIC_LIMIT,
  SITE_NOTICE_PUBLIC_MAX_LIMIT,
  type SiteNoticeInput,
  type SiteNoticeStatus,
  validateEvaluationTime,
  validateLimit,
  validateSiteNoticeInput,
} from "./notice-content";

type SiteNoticeActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;
type Transaction = Prisma.TransactionClient;

const include = {
  createdBy: { select: { authUser: { select: { name: true } } } },
  updatedBy: { select: { authUser: { select: { name: true } } } },
} satisfies Prisma.SiteNoticeInclude;

const publicSelect = {
  id: true,
  title: true,
  message: true,
  severity: true,
  targetArea: true,
  startsAt: true,
  endsAt: true,
  ctaLabel: true,
  ctaUrl: true,
} satisfies Prisma.SiteNoticeSelect;

type SiteNoticeRecord = Prisma.SiteNoticeGetPayload<{
  include: typeof include;
}>;
type PublicSiteNoticeRecord = Prisma.SiteNoticeGetPayload<{
  select: typeof publicSelect;
}>;

export type SiteNoticePublic = Readonly<{
  id: string;
  title: string;
  message: string;
  severity: SiteNoticeSeverity;
  targetArea: SiteNoticeTargetArea;
  startsAt: Date;
  endsAt: Date;
  ctaLabel: string | null;
  ctaUrl: string | null;
}>;

export type SiteNoticeAdmin = Readonly<{
  id: string;
  title: string;
  message: string;
  severity: SiteNoticeSeverity;
  targetArea: SiteNoticeTargetArea;
  lifecycle: SiteNoticeLifecycle;
  startsAt: Date | null;
  endsAt: Date | null;
  status: SiteNoticeStatus;
  hasCta: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  creatorDisplayName: string;
  updaterDisplayName: string;
  publishedAt: Date | null;
  withdrawnAt: Date | null;
}>;

export type SiteNoticeAuditWriter = (
  transaction: Transaction,
  data: Prisma.AuditEventUncheckedCreateInput,
) => Promise<void>;

export type SiteNoticeMutationDependencies = Readonly<{
  auditWriter?: SiteNoticeAuditWriter;
}>;

export type CreateSiteNoticeInput = SiteNoticeInput;

export type UpdateSiteNoticeInput = SiteNoticeInput &
  Readonly<{
    noticeId: string;
    expectedVersion: number;
  }>;

export type SiteNoticeVersionInput = Readonly<{
  noticeId: string;
  expectedVersion: number;
  at?: Date;
}>;

export type SiteNoticeReadInput = Readonly<{
  evaluationTime: Date;
  limit?: number;
}>;

export type SiteNoticeAdminListInput = SiteNoticeReadInput;

const writeAudit: SiteNoticeAuditWriter = async (transaction, data) => {
  await transaction.auditEvent.create({ data });
};

function requireCapability(actor: SiteNoticeActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

async function requireActiveAdmin(
  transaction: Transaction,
  adminUserId: string,
) {
  const admin = await transaction.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

function assertIdentifier(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ValidationError("Site Notice ID must be a valid identifier.");
  }
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(
      "Site Notice version must be a positive integer.",
    );
  }
}

function isConcurrencyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2025")
  );
}

async function runMutation<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    if (isConcurrencyError(error)) throw new ConcurrencyError();
    throw error;
  }
}

async function findNotice(transaction: Transaction, noticeId: string) {
  assertIdentifier(noticeId);
  const notice = await transaction.siteNotice.findUnique({
    where: { id: noticeId },
    include,
  });
  if (!notice) throw new NotFoundError("Site Notice was not found.");
  return notice;
}

async function findForMutation(
  transaction: Transaction,
  noticeId: string,
  expectedVersion: number,
) {
  assertVersion(expectedVersion);
  const notice = await findNotice(transaction, noticeId);
  if (notice.version !== expectedVersion) throw new ConcurrencyError();
  return notice;
}

function summary(notice: {
  severity: SiteNoticeSeverity;
  targetArea: SiteNoticeTargetArea;
  startsAt: Date | null;
  endsAt: Date | null;
  ctaLabel: string | null;
  lifecycle?: SiteNoticeLifecycle;
  version?: number;
}) {
  return {
    severity: notice.severity,
    targetArea: notice.targetArea,
    startsAt: notice.startsAt?.toISOString() ?? null,
    endsAt: notice.endsAt?.toISOString() ?? null,
    hasCta: Boolean(notice.ctaLabel),
    ...(notice.lifecycle ? { lifecycle: notice.lifecycle } : {}),
    ...(notice.version ? { version: notice.version } : {}),
  };
}

async function audit(
  transaction: Transaction,
  actorAdminUserId: string,
  action: string,
  notice: { id: string },
  auditSummary: Record<string, string | number | boolean | null>,
  dependencies: SiteNoticeMutationDependencies,
) {
  await (dependencies.auditWriter ?? writeAudit)(
    transaction,
    buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId,
      action,
      targetType: "SiteNotice",
      targetId: notice.id,
      correlationId: randomUUID(),
      summary: auditSummary,
    }),
  );
}

async function updateAtVersion(
  transaction: Transaction,
  noticeId: string,
  expectedVersion: number,
  data: Prisma.SiteNoticeUncheckedUpdateInput,
) {
  try {
    await transaction.siteNotice.update({
      where: { id_version: { id: noticeId, version: expectedVersion } },
      data: { ...data, version: { increment: 1 } },
    });
  } catch (error) {
    if (isConcurrencyError(error)) throw new ConcurrencyError();
    throw error;
  }
}

function toAdmin(
  notice: SiteNoticeRecord,
  evaluationTime: Date,
): SiteNoticeAdmin {
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    targetArea: notice.targetArea,
    lifecycle: notice.lifecycle,
    startsAt: notice.startsAt,
    endsAt: notice.endsAt,
    status: deriveSiteNoticeStatus(notice, evaluationTime),
    hasCta: Boolean(notice.ctaLabel && notice.ctaUrl),
    ctaLabel: notice.ctaLabel,
    ctaUrl: notice.ctaUrl,
    version: notice.version,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
    creatorDisplayName: notice.createdBy.authUser.name,
    updaterDisplayName: notice.updatedBy.authUser.name,
    publishedAt: notice.publishedAt,
    withdrawnAt: notice.withdrawnAt,
  };
}

function toPublic(notice: PublicSiteNoticeRecord): SiteNoticePublic {
  if (!notice.startsAt || !notice.endsAt) {
    throw new PreconditionError(
      "This Site Notice has no complete public window.",
    );
  }
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    targetArea: notice.targetArea,
    startsAt: notice.startsAt,
    endsAt: notice.endsAt,
    ctaLabel: notice.ctaLabel,
    ctaUrl: notice.ctaUrl,
  };
}

export async function createSiteNotice(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  input: CreateSiteNoticeInput,
  dependencies: SiteNoticeMutationDependencies = {},
) {
  requireCapability(actor, "communications.notices.manage");
  const validated = validateSiteNoticeInput(input);
  const evaluationTime = new Date();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const notice = await transaction.siteNotice.create({
      data: {
        ...validated,
        createdByAdminUserId: actor.adminUserId,
        updatedByAdminUserId: actor.adminUserId,
      },
      include,
    });
    await audit(
      transaction,
      actor.adminUserId,
      "site_notice.created",
      notice,
      summary(notice),
      dependencies,
    );
    return toAdmin(notice, evaluationTime);
  });
}

export async function updateSiteNotice(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  input: UpdateSiteNoticeInput,
  dependencies: SiteNoticeMutationDependencies = {},
) {
  requireCapability(actor, "communications.notices.manage");
  assertVersion(input.expectedVersion);
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const current = await findForMutation(
      transaction,
      input.noticeId,
      input.expectedVersion,
    );
    if (current.lifecycle === SiteNoticeLifecycle.WITHDRAWN) {
      throw new PreconditionError("A withdrawn Site Notice cannot be edited.");
    }
    const validated = validateSiteNoticeInput(
      input,
      current.lifecycle === SiteNoticeLifecycle.PUBLISHED ? "PUBLISH" : "DRAFT",
    );
    await updateAtVersion(transaction, current.id, input.expectedVersion, {
      ...validated,
      updatedByAdminUserId: actor.adminUserId,
    });
    const updated = await findNotice(transaction, current.id);
    await audit(
      transaction,
      actor.adminUserId,
      "site_notice.updated",
      updated,
      {
        ...summary(updated),
        priorVersion: current.version,
        version: updated.version,
      },
      dependencies,
    );
    return toAdmin(updated, new Date());
  });
}

export async function publishSiteNotice(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  input: SiteNoticeVersionInput,
  dependencies: SiteNoticeMutationDependencies = {},
) {
  requireCapability(actor, "communications.notices.manage");
  const publishedAt = input.at ?? new Date();
  validateEvaluationTime(publishedAt);
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const current = await findForMutation(
      transaction,
      input.noticeId,
      input.expectedVersion,
    );
    if (current.lifecycle !== SiteNoticeLifecycle.DRAFT) {
      throw new PreconditionError("Only draft Site Notices can be published.");
    }
    validateSiteNoticeInput(current, "PUBLISH");
    await updateAtVersion(transaction, current.id, input.expectedVersion, {
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      publishedAt,
      publishedByAdminUserId: actor.adminUserId,
      updatedByAdminUserId: actor.adminUserId,
    });
    const published = await findNotice(transaction, current.id);
    await audit(
      transaction,
      actor.adminUserId,
      "site_notice.published",
      published,
      summary(published),
      dependencies,
    );
    return toAdmin(published, publishedAt);
  });
}

export async function withdrawSiteNotice(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  input: SiteNoticeVersionInput,
  dependencies: SiteNoticeMutationDependencies = {},
) {
  requireCapability(actor, "communications.notices.manage");
  const withdrawnAt = input.at ?? new Date();
  validateEvaluationTime(withdrawnAt);
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const current = await findForMutation(
      transaction,
      input.noticeId,
      input.expectedVersion,
    );
    if (current.lifecycle === SiteNoticeLifecycle.WITHDRAWN) {
      throw new PreconditionError("This Site Notice is already withdrawn.");
    }
    if (current.lifecycle !== SiteNoticeLifecycle.PUBLISHED) {
      throw new PreconditionError(
        "Only published Site Notices can be withdrawn.",
      );
    }
    await updateAtVersion(transaction, current.id, input.expectedVersion, {
      lifecycle: SiteNoticeLifecycle.WITHDRAWN,
      withdrawnAt,
      withdrawnByAdminUserId: actor.adminUserId,
      updatedByAdminUserId: actor.adminUserId,
    });
    const withdrawn = await findNotice(transaction, current.id);
    await audit(
      transaction,
      actor.adminUserId,
      "site_notice.withdrawn",
      withdrawn,
      summary(withdrawn),
      dependencies,
    );
    return toAdmin(withdrawn, withdrawnAt);
  });
}

export async function getSiteNotice(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  noticeId: string,
  evaluationTime: Date,
) {
  requireCapability(actor, "communications.notices.manage");
  validateEvaluationTime(evaluationTime);
  await requireActiveAdmin(prisma, actor.adminUserId);
  const notice = await prisma.siteNotice.findUnique({
    where: { id: noticeId },
    include,
  });
  if (!notice) throw new NotFoundError("Site Notice was not found.");
  return toAdmin(notice, evaluationTime);
}

export async function listSiteNotices(
  prisma: PrismaClient,
  actor: SiteNoticeActor,
  input: SiteNoticeAdminListInput,
) {
  requireCapability(actor, "communications.notices.manage");
  validateEvaluationTime(input.evaluationTime);
  const limit = validateLimit(
    input.limit,
    SITE_NOTICE_ADMIN_LIMIT,
    SITE_NOTICE_ADMIN_MAX_LIMIT,
    "Administrative Site Notice limit",
  );
  await requireActiveAdmin(prisma, actor.adminUserId);
  const notices = await prisma.siteNotice.findMany({
    include,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
  });
  return notices.map((notice) => toAdmin(notice, input.evaluationTime));
}

export async function getEffectiveSiteNotices(
  prisma: PrismaClient,
  targetArea: SiteNoticeTargetArea,
  input: SiteNoticeReadInput,
) {
  if (!Object.values(SiteNoticeTargetArea).includes(targetArea)) {
    throw new ValidationError("Target area is not supported.");
  }
  validateEvaluationTime(input.evaluationTime);
  const limit = validateLimit(
    input.limit,
    SITE_NOTICE_PUBLIC_LIMIT,
    SITE_NOTICE_PUBLIC_MAX_LIMIT,
    "Public Site Notice limit",
  );
  const notices = await prisma.siteNotice.findMany({
    where: {
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      targetArea,
      title: { not: "" },
      message: { not: "" },
      startsAt: { lte: input.evaluationTime },
      endsAt: { gt: input.evaluationTime },
    },
    select: publicSelect,
    orderBy: [{ severity: "desc" }, { startsAt: "desc" }, { id: "asc" }],
    take: Math.max(limit, SITE_NOTICE_PUBLIC_MAX_LIMIT),
  });
  return notices
    .filter((notice) => notice.startsAt !== null && notice.endsAt !== null)
    .sort((left, right) =>
      compareEffectiveSiteNotices(
        {
          id: left.id,
          severity: left.severity,
          startsAt: left.startsAt!,
        },
        {
          id: right.id,
          severity: right.severity,
          startsAt: right.startsAt!,
        },
      ),
    )
    .slice(0, limit)
    .map(toPublic);
}
