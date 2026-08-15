import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import { digestInvitationToken } from "@/platform/auth/invitation-proof";

type BootstrapInput = {
  appBaseUrl: string;
  email: string;
  expectedDomain: string;
};

function normalizeDomain(value: string) {
  return value.trim().toLowerCase();
}

export async function createInitialSuperAdminInvitation(
  prisma: PrismaClient,
  input: BootstrapInput,
  now = new Date(),
) {
  const email = input.email.trim().toLowerCase();
  const expectedDomain = normalizeDomain(input.expectedDomain);
  const appOrigin = new URL(input.appBaseUrl).origin;
  if (email.split("@").at(-1) !== expectedDomain) {
    throw new Error("The bootstrap address must use GOOGLE_WORKSPACE_DOMAIN.");
  }

  const invitationToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const invitation = await prisma.$transaction(async (transaction) => {
    await transaction.adminInvitation.updateMany({
      where: {
        isSuperAdminBootstrap: true,
        status: "PENDING",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED", version: { increment: 1 } },
    });

    const [existingGrant, existingBootstrap, role] = await Promise.all([
      transaction.superAdminGrant.findFirst(),
      transaction.adminInvitation.findFirst({
        where: {
          isSuperAdminBootstrap: true,
          status: "PENDING",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
      transaction.role.findUnique({ where: { key: "super-admin" } }),
    ]);
    if (existingGrant) throw new Error("A Super Admin already exists.");
    if (existingBootstrap) {
      throw new Error(
        "A pending Super Admin bootstrap invitation already exists.",
      );
    }
    if (!role?.isActive) {
      throw new Error("Run the catalog seed before bootstrapping Super Admin.");
    }

    const created = await transaction.adminInvitation.create({
      data: {
        email,
        hostedDomain: expectedDomain,
        tokenDigest: digestInvitationToken(invitationToken),
        expiresAt,
        isSuperAdminBootstrap: true,
        intendedRoles: { create: [{ roleId: role.id }] },
      },
    });
    await transaction.auditEvent.create({
      data: buildAuditEvent({
        actorKind: "SYSTEM",
        action: "admin.super_admin.bootstrap_invitation.create",
        targetType: "AdminInvitation",
        targetId: created.id,
        summary: { expiresAt: expiresAt.toISOString() },
      }),
    });
    return created;
  });

  return {
    expiresAt: invitation.expiresAt,
    invitationId: invitation.id,
    invitationUrl: `${appOrigin}/admin/invitations/accept?token=${encodeURIComponent(invitationToken)}`,
  };
}
