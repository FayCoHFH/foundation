import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

export const PLACEMENT_KEYS = [
  "HOME_HERO",
  "HOME_FEATURED_STORY",
  "HOME_FEATURED_NEWS",
  "NEWS_FEATURED",
] as const;
export type PlacementKey = (typeof PLACEMENT_KEYS)[number];
type Actor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

const allowed: Record<PlacementKey, readonly ("STORY" | "NEWS")[]> = {
  HOME_HERO: ["STORY", "NEWS"],
  HOME_FEATURED_STORY: ["STORY"],
  HOME_FEATURED_NEWS: ["NEWS"],
  NEWS_FEATURED: ["NEWS"],
};

function capability(actor: Actor, value: Capability) {
  if (!actor.capabilities.includes(value)) throw new AuthorizationError();
}
function window(startsAt: Date, endsAt?: Date | null) {
  if (
    Number.isNaN(startsAt.valueOf()) ||
    (endsAt && Number.isNaN(endsAt.valueOf()))
  )
    throw new ValidationError("Enter valid placement dates.");
  if (endsAt && startsAt >= endsAt)
    throw new ValidationError("Placement start must precede its end.");
}
export function allowsPlacementTarget(
  placement: PlacementKey,
  kind: "STORY" | "NEWS",
) {
  return allowed[placement].includes(kind);
}
export function placementIsActive(
  item: { startsAt: Date; endsAt: Date | null },
  now = new Date(),
) {
  return item.startsAt <= now && (!item.endsAt || item.endsAt > now);
}
async function eligible(
  db: PrismaClient,
  placement: PlacementKey,
  publicationId: string,
  now: Date,
) {
  const publication = await db.publication.findUnique({
    where: { id: publicationId },
    include: { publicProjection: true, publicNewsProjection: true },
  });
  if (!publication || !allowsPlacementTarget(placement, publication.kind))
    throw new PreconditionError(
      "This content type cannot occupy that placement.",
    );
  const story = publication.publicProjection;
  const news = publication.publicNewsProjection;
  const currentNews = !news?.expiresAt || news.expiresAt > now;
  if (
    publication.releaseState !== "PUBLISHED" ||
    publication.discoveryDisposition !== "ACTIVE" ||
    (!story && !news) ||
    (news && !currentNews)
  )
    throw new PreconditionError(
      "Only currently eligible public content can be placed.",
    );
  return publication;
}
export async function assignPlacement(
  db: PrismaClient,
  actor: Actor,
  input: {
    key: PlacementKey;
    publicationId: string;
    startsAt?: Date;
    endsAt?: Date | null;
    expectedVersion?: number;
  },
) {
  capability(actor, "communications.placements.manage");
  const startsAt = input.startsAt ?? new Date();
  window(startsAt, input.endsAt);
  return db.$transaction(async (tx) => {
    const active = await tx.adminUser.findFirst({
      where: { id: actor.adminUserId, status: "ACTIVE" },
    });
    if (!active) throw new AuthorizationError();
    const publication = await eligible(
      tx as PrismaClient,
      input.key,
      input.publicationId,
      startsAt,
    );
    const current = await tx.contentPlacement.findFirst({
      where: {
        key: input.key,
        cancelledAt: null,
        startsAt: { lte: startsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
      orderBy: { startsAt: "desc" },
    });
    if (
      current &&
      input.expectedVersion !== undefined &&
      current.version !== input.expectedVersion
    )
      throw new ConcurrencyError();
    if (!current && input.expectedVersion !== undefined) {
      const latest = await tx.contentPlacement.findFirst({
        where: { key: input.key },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      });
      if (latest && latest.version !== input.expectedVersion)
        throw new ConcurrencyError();
    }
    if (current)
      await tx.contentPlacement.update({
        where: { id: current.id },
        data: {
          endsAt: startsAt,
          updatedByAdminUserId: actor.adminUserId,
          version: { increment: 1 },
        },
      });
    const result = await tx.contentPlacement.create({
      data: {
        key: input.key,
        publicationId: publication.id,
        startsAt,
        endsAt: input.endsAt ?? null,
        version: current ? current.version + 1 : 1,
        createdByAdminUserId: actor.adminUserId,
        updatedByAdminUserId: actor.adminUserId,
      },
    });
    await tx.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: current ? "placement.replaced" : "placement.assigned",
        targetType: "ContentPlacement",
        targetId: result.id,
        correlationId: randomUUID(),
        summary: {
          placement: input.key,
          publicationId: publication.id,
          kind: publication.kind,
          startsAt: startsAt.toISOString(),
          endsAt: input.endsAt?.toISOString() ?? null,
          previousPlacementId: current?.id ?? null,
          previousStartsAt: current?.startsAt.toISOString() ?? null,
          previousEndsAt: current?.endsAt?.toISOString() ?? null,
        },
      }),
    });
    return result;
  });
}
export async function clearPlacement(
  db: PrismaClient,
  actor: Actor,
  placement: PlacementKey,
  expectedVersion?: number,
) {
  capability(actor, "communications.placements.manage");
  const now = new Date();
  return db.$transaction(async (tx) => {
    const current = await tx.contentPlacement.findFirst({
      where: {
        key: placement,
        cancelledAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { publication: { select: { kind: true } } },
    });
    if (!current) {
      if (expectedVersion !== undefined) {
        const latest = await tx.contentPlacement.findFirst({
          where: { key: placement },
          orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        });
        if (latest && latest.version !== expectedVersion)
          throw new ConcurrencyError();
      }
      return;
    }
    if (expectedVersion !== undefined && current.version !== expectedVersion)
      throw new ConcurrencyError();
    await tx.contentPlacement.update({
      where: { id: current.id },
      data: {
        endsAt: now,
        updatedByAdminUserId: actor.adminUserId,
        version: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "placement.cleared",
        targetType: "ContentPlacement",
        targetId: current.id,
        correlationId: randomUUID(),
        summary: {
          placement: current.key,
          publicationId: current.publicationId,
          kind: current.publication.kind,
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt?.toISOString() ?? null,
          endedAt: now.toISOString(),
        },
      }),
    });
  });
}
export async function cancelFuturePlacement(
  db: PrismaClient,
  actor: Actor,
  placementId: string,
  expectedVersion?: number,
) {
  capability(actor, "communications.placements.manage");
  const now = new Date();
  return db.$transaction(async (tx) => {
    const item = await tx.contentPlacement.findUnique({
      where: { id: placementId },
    });
    if (!item || item.startsAt <= now)
      throw new PreconditionError("Only a future placement can be cancelled.");
    if (expectedVersion !== undefined && item.version !== expectedVersion)
      throw new ConcurrencyError();
    if (item.cancelledAt)
      throw new PreconditionError("This placement has already been cancelled.");
    await tx.contentPlacement.update({
      where: { id: item.id },
      data: {
        cancelledAt: now,
        updatedByAdminUserId: actor.adminUserId,
        version: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "placement.cancelled",
        targetType: "ContentPlacement",
        targetId: item.id,
        correlationId: randomUUID(),
        summary: {
          placement: item.key,
          publicationId: item.publicationId,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt?.toISOString() ?? null,
          cancelledAt: now.toISOString(),
        },
      }),
    });
  });
}
export async function getPlacementState(
  db: PrismaClient,
  placement: PlacementKey,
  now = new Date(),
) {
  const rows = await db.contentPlacement.findMany({
    where: {
      key: placement,
      cancelledAt: null,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: {
      publication: {
        include: { publicProjection: true, publicNewsProjection: true },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  const current = rows.find((row) => placementIsActive(row, now)) ?? null;
  const upcoming = rows.find((row) => row.startsAt > now) ?? null;
  return { current, upcoming };
}
export async function getEffectivePlacement(
  db: PrismaClient,
  placement: PlacementKey,
  now = new Date(),
) {
  const row = await db.contentPlacement.findFirst({
    where: {
      key: placement,
      startsAt: { lte: now },
      cancelledAt: null,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: {
      publication: {
        include: { publicProjection: true, publicNewsProjection: true },
      },
    },
    orderBy: { startsAt: "desc" },
  });
  if (!row) return null;
  const publication = row.publication,
    story = publication.publicProjection,
    news = publication.publicNewsProjection;
  if (
    publication.releaseState !== "PUBLISHED" ||
    publication.discoveryDisposition !== "ACTIVE" ||
    (!story && !news) ||
    (publication.kind === "STORY" ? !story : !news) ||
    (news?.expiresAt && news.expiresAt <= now)
  )
    return null;
  return {
    placement: {
      id: row.id,
      key: row.key,
      publicationId: row.publicationId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    },
    story: story
      ? {
          slug: story.slug,
          headline: story.headline,
          deck: story.deck,
          excerpt: story.excerpt,
          body: story.body,
          publishedAt: story.publishedAt,
        }
      : null,
    news: news
      ? {
          slug: news.slug,
          headline: news.headline,
          summary: news.summary,
          body: news.body,
          publishedAt: news.publishedAt,
          expiresAt: news.expiresAt,
        }
      : null,
  };
}
