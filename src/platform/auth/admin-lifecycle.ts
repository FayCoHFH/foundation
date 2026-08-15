import "server-only";

import { buildAuditEvent } from "@/platform/audit/event";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  assertFreshAuthentication,
  requireCapability,
} from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, ConcurrencyError } from "@/platform/errors/app-error";

export async function suspendAdminUser(
  actor: AdminPrincipal,
  targetAdminUserId: string,
  expectedVersion: number,
  reason: string,
  now = new Date(),
) {
  requireCapability(actor, "users.suspend");
  assertFreshAuthentication(actor, now);
  if (reason.trim().length < 12) {
    throw new AppError(
      "INVALID_INPUT",
      "A suspension reason of at least 12 characters is required.",
      400,
      true,
    );
  }

  return prisma.$transaction(async (transaction) => {
    const target = await transaction.adminUser.findUnique({
      where: { id: targetAdminUserId },
      include: { superAdminGrant: true },
    });
    if (!target) {
      throw new AppError("NOT_FOUND", "Administrator not found.", 404, true);
    }
    if (target.superAdminGrant) {
      throw new AppError(
        "PRECONDITION_FAILED",
        "A Super Admin grant must be explicitly removed through a separately reviewed demotion or recovery procedure before suspension.",
        412,
        true,
      );
    }

    const updated = await transaction.adminUser.updateMany({
      where: {
        id: targetAdminUserId,
        status: "ACTIVE",
        version: expectedVersion,
      },
      data: {
        status: "SUSPENDED",
        statusChangedAt: now,
        suspendedAt: now,
        revokedAt: null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConcurrencyError();

    const [revokedAssignments, revokedSessions] = await Promise.all([
      transaction.userRole.updateMany({
        where: { adminUserId: targetAdminUserId, revokedAt: null },
        data: {
          revokedAt: now,
          revokedById: actor.adminUserId,
          revocationReason: reason.trim(),
        },
      }),
      transaction.session.deleteMany({
        where: { userId: target.authUserId },
      }),
    ]);

    await transaction.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "admin.user.suspend",
        targetType: "AdminUser",
        targetId: targetAdminUserId,
        summary: {
          reason: reason.trim(),
          revokedAssignments: revokedAssignments.count,
          revokedSessions: revokedSessions.count,
        },
      }),
    });

    return {
      status: "SUSPENDED" as const,
      revokedAssignments: revokedAssignments.count,
      revokedSessions: revokedSessions.count,
    };
  });
}

export async function restoreAdminUser(
  actor: AdminPrincipal,
  targetAdminUserId: string,
  expectedVersion: number,
  reason: string,
  now = new Date(),
) {
  requireCapability(actor, "users.restore");
  assertFreshAuthentication(actor, now);
  if (reason.trim().length < 12) {
    throw new AppError(
      "INVALID_INPUT",
      "A restoration reason of at least 12 characters is required.",
      400,
      true,
    );
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.adminUser.updateMany({
      where: {
        id: targetAdminUserId,
        status: "SUSPENDED",
        version: expectedVersion,
      },
      data: {
        status: "ACTIVE",
        statusChangedAt: now,
        suspendedAt: null,
        revokedAt: null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConcurrencyError();

    await transaction.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "admin.user.restore",
        targetType: "AdminUser",
        targetId: targetAdminUserId,
        summary: {
          reason: reason.trim(),
          rolesRemainRevoked: true,
        },
      }),
    });
    return { status: "ACTIVE" as const, rolesRemainRevoked: true };
  });
}
