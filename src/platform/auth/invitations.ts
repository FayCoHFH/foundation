import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { buildAuditEvent } from "@/platform/audit/event";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  assertFreshAuthentication,
  requireCapability,
} from "@/platform/auth/principal";
import { digestInvitationToken } from "@/platform/auth/invitation-proof";
import { readServerEnvironment } from "@/platform/config/environment";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

const invitationInputSchema = z.object({
  email: z.email(),
  expiresAt: z.date(),
  roleKeys: z.array(z.string().min(1)).min(1).max(10),
});

export type CreateInvitationInput = z.infer<typeof invitationInputSchema>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createAdminInvitation(
  actor: AdminPrincipal,
  input: CreateInvitationInput,
  now = new Date(),
) {
  requireCapability(actor, "users.invite");
  assertFreshAuthentication(actor, now);
  const environment = readServerEnvironment();
  const parsed = invitationInputSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const emailDomain = email.split("@").at(-1);
  if (emailDomain !== environment.googleWorkspaceDomain) {
    throw new AppError(
      "INVALID_INPUT",
      "The invitation must use the approved Google Workspace domain.",
      400,
      true,
    );
  }
  const minimumExpiry = new Date(now.getTime() + 60 * 60 * 1000);
  const maximumExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (parsed.expiresAt < minimumExpiry || parsed.expiresAt > maximumExpiry) {
    throw new AppError(
      "INVALID_INPUT",
      "Invitation expiry must be between one hour and seven days.",
      400,
      true,
    );
  }

  const invitationToken = randomBytes(32).toString("base64url");
  const tokenDigest = digestInvitationToken(invitationToken);
  const roleKeys = [...new Set(parsed.roleKeys)];
  if (roleKeys.includes("super-admin")) {
    throw new AppError(
      "PRECONDITION_FAILED",
      "Super Admin cannot be granted through normal invitations; use the explicit bootstrap or audited promotion procedure.",
      412,
      true,
    );
  }

  const invitation = await prisma.$transaction(async (transaction) => {
    await transaction.adminInvitation.updateMany({
      where: {
        email,
        status: "PENDING",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      data: {
        status: "EXPIRED",
        version: { increment: 1 },
      },
    });

    const existing = await transaction.adminInvitation.findFirst({
      where: {
        email,
        status: "PENDING",
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        "CONFLICT",
        "A pending invitation already exists for this address.",
        409,
        true,
      );
    }

    const roles = await transaction.role.findMany({
      where: { key: { in: roleKeys }, isActive: true },
      select: { id: true, key: true },
    });
    if (roles.length !== roleKeys.length) {
      throw new AppError(
        "INVALID_INPUT",
        "One or more selected role presets are unavailable.",
        400,
        true,
      );
    }

    const created = await transaction.adminInvitation.create({
      data: {
        email,
        tokenDigest,
        hostedDomain: environment.googleWorkspaceDomain,
        expiresAt: parsed.expiresAt,
        createdById: actor.adminUserId,
        intendedRoles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
    });

    await transaction.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "admin.invitation.create",
        targetType: "AdminInvitation",
        targetId: created.id,
        summary: {
          roleKeys: roles.map((role) => role.key).sort(),
          expiresAt: parsed.expiresAt.toISOString(),
        },
      }),
    });
    return created;
  });

  return {
    invitationId: invitation.id,
    invitationUrl: `${environment.appBaseUrl}/admin/invitations/accept?token=${encodeURIComponent(invitationToken)}`,
    expiresAt: invitation.expiresAt,
  };
}
