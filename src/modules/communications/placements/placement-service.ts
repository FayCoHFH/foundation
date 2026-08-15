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
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
    if (!current) return;
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
  });
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
    news = publication.publicNewsProjection;
  if (
    publication.releaseState !== "PUBLISHED" ||
    publication.discoveryDisposition !== "ACTIVE" ||
    (news?.expiresAt && news.expiresAt <= now)
  )
    return null;
  return { placement: row, story: publication.publicProjection, news };
}
