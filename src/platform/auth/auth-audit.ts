import "server-only";

import { buildAuditEvent } from "@/platform/audit/event";
import { prisma } from "@/platform/database/prisma";

export type AuthenticationAuditAction =
  "admin.auth.login.success" | "admin.auth.logout";

export async function recordAuthenticationAudit(
  authUserId: string,
  action: AuthenticationAuditAction,
) {
  const principal = await prisma.adminUser.findUnique({
    where: { authUserId },
    select: { id: true, status: true },
  });
  if (!principal || principal.status !== "ACTIVE") return false;

  await prisma.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId: principal.id,
      action,
      targetType: "AdminUser",
      targetId: principal.id,
      summary: { provider: "google" },
    }),
  });
  return true;
}
