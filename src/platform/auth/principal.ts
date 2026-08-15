import "server-only";

import { headers } from "next/headers";

import { auth } from "@/platform/auth/auth";
import { withPseudonymousRateLimitHeaders } from "@/platform/auth/rate-limit-identity";
import { type Capability, isCapability } from "@/platform/auth/capabilities";
export {
  assertFreshAuthentication,
  safeAdminNextPath,
} from "@/platform/auth/policy";
import { prisma } from "@/platform/database/prisma";
import { readServerEnvironment } from "@/platform/config/environment";
import { AuthorizationError } from "@/platform/errors/app-error";

export type AdminPrincipal = {
  adminUserId: string;
  authUserId: string;
  capabilities: readonly Capability[];
  email: string;
  isSuperAdmin: boolean;
  name: string;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  sessionId: string;
};

export type AdminAccessResult =
  | { status: "authorized"; principal: AdminPrincipal }
  | { status: "denied" }
  | { status: "unauthenticated" };

export async function resolveAdminAccess(
  requestHeaders?: Headers,
): Promise<AdminAccessResult> {
  const resolvedHeaders = requestHeaders ?? (await headers());
  const session = await auth.api.getSession({
    headers: withPseudonymousRateLimitHeaders(
      resolvedHeaders,
      readServerEnvironment(),
    ),
  });
  if (!session) return { status: "unauthenticated" };

  const adminUser = await prisma.adminUser.findUnique({
    where: { authUserId: session.user.id },
    include: {
      externalIdentities: true,
      roleAssignments: {
        where: { revokedAt: null, role: { isActive: true } },
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
      superAdminGrant: true,
    },
  });

  const identity = adminUser?.externalIdentities.find(
    (candidate) =>
      candidate.provider === "GOOGLE" &&
      candidate.authUserId === session.user.id &&
      candidate.emailVerified,
  );
  if (!adminUser || adminUser.status !== "ACTIVE" || !identity) {
    return { status: "denied" };
  }

  const capabilities = [
    ...new Set(
      adminUser.roleAssignments.flatMap((assignment) =>
        assignment.role.permissions
          .map(({ permission }) => permission.key)
          .filter(isCapability),
      ),
    ),
  ].sort();

  return {
    status: "authorized",
    principal: {
      adminUserId: adminUser.id,
      authUserId: session.user.id,
      capabilities,
      email: session.user.email,
      isSuperAdmin: Boolean(adminUser.superAdminGrant),
      name: session.user.name,
      sessionCreatedAt: session.session.createdAt,
      sessionExpiresAt: session.session.expiresAt,
      sessionId: session.session.id,
    },
  };
}

export function hasCapability(
  principal: AdminPrincipal,
  capability: Capability,
) {
  return principal.capabilities.includes(capability);
}

export function requireCapability(
  principal: AdminPrincipal,
  capability: Capability,
) {
  if (!hasCapability(principal, capability)) throw new AuthorizationError();
}
