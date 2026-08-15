import "server-only";

import { buildAuditEvent } from "@/platform/audit/event";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  assertFreshAuthentication,
  requireCapability,
} from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, ConcurrencyError } from "@/platform/errors/app-error";

export async function promoteAdminUserToSuperAdmin(
  actor: AdminPrincipal,
  targetAdminUserId: string,
  expectedVersion: number,
  reason: string,
  now = new Date(),
) {
  requireCapability(actor, "users.roles.assign");
  assertFreshAuthentication(actor, now);
  if (!actor.isSuperAdmin) {
    throw new AppError(
      "AUTHORIZATION_DENIED",
      "Only a current Super Admin can perform this promotion.",
      403,
      true,
    );
  }
  if (reason.trim().length < 12) {
    throw new AppError(
      "INVALID_INPUT",
      "A promotion reason of at least 12 characters is required.",
      400,
      true,
    );
  }

  return prisma.$transaction(async (transaction) => {
    const [currentActor, role] = await Promise.all([
      transaction.adminUser.findUnique({
        where: { id: actor.adminUserId },
        include: { superAdminGrant: true },
      }),
      transaction.role.findUnique({ where: { key: "super-admin" } }),
    ]);
    if (
      currentActor?.status !== "ACTIVE" ||
      !currentActor.superAdminGrant ||
      !role?.isActive
    ) {
      throw new AppError(
        "AUTHORIZATION_DENIED",
        "The promotion is no longer authorized.",
        403,
        true,
      );
    }

    const changed = await transaction.adminUser.updateMany({
      where: {
        id: targetAdminUserId,
        status: "ACTIVE",
        version: expectedVersion,
        superAdminGrant: null,
      },
      data: { version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConcurrencyError();

    const activeAssignment = await transaction.userRole.findFirst({
      where: {
        adminUserId: targetAdminUserId,
        roleId: role.id,
        revokedAt: null,
      },
    });
    if (activeAssignment) {
      throw new AppError(
        "PRECONDITION_FAILED",
        "The target has an inconsistent active Super Admin role assignment.",
        412,
        true,
      );
    }
    await transaction.userRole.create({
      data: {
        adminUserId: targetAdminUserId,
        roleId: role.id,
        grantedById: actor.adminUserId,
        assignmentReason: reason.trim(),
      },
    });

    const grant = await transaction.superAdminGrant.create({
      data: {
        adminUserId: targetAdminUserId,
        grantedById: actor.adminUserId,
        reason: reason.trim(),
      },
    });
    await transaction.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "admin.super_admin.promote",
        targetType: "AdminUser",
        targetId: targetAdminUserId,
        summary: {
          reason: reason.trim(),
          grantId: grant.id,
          freshAuthenticationRequired: true,
        },
      }),
    });

    return { grantId: grant.id, status: "PROMOTED" as const };
  });
}
