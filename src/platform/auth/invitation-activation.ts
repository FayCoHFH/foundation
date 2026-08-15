import "server-only";

import { APIError } from "better-auth/api";

import { buildAuditEvent } from "@/platform/audit/event";
import { prisma } from "@/platform/database/prisma";
import {
  digestInvitationToken,
  invitationProofFromCookieHeader,
  verifyInvitationProof,
} from "@/platform/auth/invitation-proof";
import { readServerEnvironment } from "@/platform/config/environment";

type AuthUserCandidate = {
  email: string;
  emailVerified: boolean;
  workspaceDomain?: unknown;
};

type AuthUserUpdateCandidate = {
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  workspaceDomain?: unknown;
  [key: string]: unknown;
};

function denyAuthentication(): never {
  throw new APIError("FORBIDDEN", {
    message: "This Google identity is not eligible for administration.",
  });
}

function getProof(request: Request | undefined) {
  const rawCookie = invitationProofFromCookieHeader(
    request?.headers.get("cookie"),
  );
  return verifyInvitationProof(rawCookie);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type GoogleIdentityInvariant = {
  authAccountId: string;
  authUserId: string;
  emailVerified: boolean;
  hostedDomain: string | null;
  provider: string;
  subject: string;
};

function matchesCurrentGoogleIdentity(
  identity: GoogleIdentityInvariant,
  account: { accountId: string; id: string },
  authUserId: string,
  expectedDomain: string,
) {
  return (
    identity.provider === "GOOGLE" &&
    identity.subject === account.accountId &&
    identity.authAccountId === account.id &&
    identity.authUserId === authUserId &&
    identity.emailVerified &&
    identity.hostedDomain === expectedDomain
  );
}

export async function verifyInvitationBeforeAuthUserCreate(
  candidate: AuthUserCandidate,
  request: Request | undefined,
) {
  const environment = readServerEnvironment();
  const email = normalizeEmail(candidate.email);
  const hostedDomain =
    typeof candidate.workspaceDomain === "string"
      ? candidate.workspaceDomain.toLowerCase()
      : undefined;
  const proof = getProof(request);

  if (
    !candidate.emailVerified ||
    hostedDomain !== environment.googleWorkspaceDomain ||
    !proof
  ) {
    denyAuthentication();
  }

  const invitation = await prisma.adminInvitation.findFirst({
    where: {
      tokenDigest: digestInvitationToken(proof.invitationToken),
      email,
      hostedDomain,
      status: "PENDING",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!invitation) denyAuthentication();

  return {
    ...candidate,
    email,
    workspaceDomain: hostedDomain,
  };
}

export function verifyIdentityClaimsBeforeAuthUserUpdate<
  T extends AuthUserUpdateCandidate,
>(candidate: T): T {
  const touchesIdentity =
    candidate.email !== undefined ||
    candidate.emailVerified !== undefined ||
    candidate.workspaceDomain !== undefined;
  if (!touchesIdentity) return candidate;

  const expectedDomain = readServerEnvironment().googleWorkspaceDomain;
  const hostedDomain =
    typeof candidate.workspaceDomain === "string"
      ? candidate.workspaceDomain.trim().toLowerCase()
      : undefined;
  if (
    !candidate.email ||
    candidate.emailVerified !== true ||
    hostedDomain !== expectedDomain
  ) {
    denyAuthentication();
  }

  return {
    ...candidate,
    email: normalizeEmail(candidate.email),
    workspaceDomain: hostedDomain,
  };
}

export async function activateAndRequirePrincipalBeforeSession(
  authUserId: string,
  request: Request | undefined,
) {
  const environment = readServerEnvironment();
  const now = new Date();
  const authUser = await prisma.user.findUnique({
    where: { id: authUserId },
    include: {
      accounts: true,
      adminUser: {
        include: { externalIdentities: true },
      },
    },
  });

  if (
    !authUser?.emailVerified ||
    authUser.workspaceDomain !== environment.googleWorkspaceDomain
  ) {
    denyAuthentication();
  }

  const googleAccounts = authUser.accounts.filter(
    (account) => account.providerId === "google",
  );
  if (googleAccounts.length !== 1) denyAuthentication();
  const googleAccount = googleAccounts[0];
  if (!googleAccount) denyAuthentication();
  if (
    googleAccount.accessToken ||
    googleAccount.refreshToken ||
    googleAccount.idToken ||
    googleAccount.password ||
    googleAccount.accessTokenExpiresAt ||
    googleAccount.refreshTokenExpiresAt
  ) {
    denyAuthentication();
  }

  const existingIdentity = authUser.adminUser?.externalIdentities.find(
    (identity) => identity.provider === "GOOGLE",
  );

  if (existingIdentity) {
    if (
      authUser.adminUser?.status !== "ACTIVE" ||
      !matchesCurrentGoogleIdentity(
        existingIdentity,
        googleAccount,
        authUser.id,
        environment.googleWorkspaceDomain,
      )
    ) {
      denyAuthentication();
    }

    await prisma.externalIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        lastAuthenticatedAt: now,
        email: authUser.email,
      },
    });
    return authUser.adminUser;
  }

  const proof = getProof(request);
  if (!proof) denyAuthentication();
  const tokenDigest = digestInvitationToken(proof.invitationToken);

  try {
    const adminUser = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.adminInvitation.findFirst({
        where: {
          tokenDigest,
          email: authUser.email,
          hostedDomain: environment.googleWorkspaceDomain,
          status: "PENDING",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        include: {
          intendedRoles: {
            include: { role: true },
          },
        },
      });
      if (
        !invitation ||
        invitation.intendedRoles.some(({ role }) => !role.isActive)
      ) {
        denyAuthentication();
      }

      const existingLocalPrincipal = await transaction.adminUser.findUnique({
        where: { authUserId: authUser.id },
      });
      if (
        existingLocalPrincipal &&
        !["INVITED", "ACTIVE"].includes(existingLocalPrincipal.status)
      ) {
        denyAuthentication();
      }
      const localPrincipal = existingLocalPrincipal
        ? await transaction.adminUser.update({
            where: { id: existingLocalPrincipal.id },
            data: {
              status: "ACTIVE",
              statusChangedAt: now,
              suspendedAt: null,
              revokedAt: null,
              version: { increment: 1 },
            },
          })
        : await transaction.adminUser.create({
            data: {
              authUserId: authUser.id,
              status: "ACTIVE",
              statusChangedAt: now,
            },
          });

      const consumed = await transaction.adminInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenDigest,
          status: "PENDING",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedById: localPrincipal.id,
          version: { increment: 1 },
        },
      });
      if (consumed.count !== 1) denyAuthentication();

      await transaction.externalIdentity.create({
        data: {
          adminUserId: localPrincipal.id,
          authUserId: authUser.id,
          authAccountId: googleAccount.id,
          provider: "GOOGLE",
          subject: googleAccount.accountId,
          email: authUser.email,
          emailVerified: true,
          hostedDomain: environment.googleWorkspaceDomain,
          linkedAt: now,
          lastAuthenticatedAt: now,
        },
      });

      if (invitation.intendedRoles.length > 0) {
        await transaction.userRole.createMany({
          data: invitation.intendedRoles.map(({ roleId }) => ({
            adminUserId: localPrincipal.id,
            roleId,
            sourceInvitationId: invitation.id,
            assignmentReason: "Initial role from accepted invitation",
          })),
          skipDuplicates: true,
        });
      }

      if (invitation.isSuperAdminBootstrap) {
        await transaction.superAdminGrant.create({
          data: {
            adminUserId: localPrincipal.id,
            reason: "Initial Super Admin bootstrap invitation",
          },
        });
      }

      await transaction.auditEvent.create({
        data: buildAuditEvent({
          actorKind: "SYSTEM",
          action: "admin.invitation.accept",
          targetType: "AdminUser",
          targetId: localPrincipal.id,
          summary: {
            invitationId: invitation.id,
            provider: "google",
            roleCount: invitation.intendedRoles.length,
          },
        }),
      });

      return localPrincipal;
    });

    if (adminUser.status !== "ACTIVE") denyAuthentication();
    return adminUser;
  } catch (error) {
    if (error instanceof APIError) throw error;

    // A retry after application activation but before session insertion is
    // handled through the identity branch above. Other failures remain closed.
    const recovered = await prisma.adminUser.findUnique({
      where: { authUserId },
      include: { externalIdentities: true },
    });
    const recoveredIdentity = recovered?.externalIdentities.find((identity) =>
      matchesCurrentGoogleIdentity(
        identity,
        googleAccount,
        authUser.id,
        environment.googleWorkspaceDomain,
      ),
    );
    if (recovered?.status === "ACTIVE" && recoveredIdentity) return recovered;
    denyAuthentication();
  }
}
