import { randomBytes, randomUUID } from "node:crypto";

import { APIError } from "better-auth/api";
import { beforeAll, describe, expect, it } from "vitest";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const { auth } = await import("@/platform/auth/auth");
const { recordAuthenticationAudit } =
  await import("@/platform/auth/auth-audit");
const { suspendAdminUser } = await import("@/platform/auth/admin-lifecycle");
const { createAdminInvitation } = await import("@/platform/auth/invitations");
const {
  activateAndRequirePrincipalBeforeSession,
  verifyIdentityClaimsBeforeAuthUserUpdate,
  verifyInvitationBeforeAuthUserCreate,
} = await import("@/platform/auth/invitation-activation");
const {
  createInvitationProof,
  digestInvitationToken,
  INVITATION_PROOF_COOKIE,
} = await import("@/platform/auth/invitation-proof");
const { promoteAdminUserToSuperAdmin } =
  await import("@/platform/auth/super-admin");
const { createInitialSuperAdminInvitation } =
  await import("@/platform/auth/super-admin-bootstrap");
const { RATE_LIMIT_IDENTITY_HEADER, withPseudonymousRateLimitIdentity } =
  await import("@/platform/auth/rate-limit-identity");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

const domain = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "example.org";

function invitationRequest(token: string) {
  return new Request("http://127.0.0.1:3000/api/auth/callback/google", {
    headers: {
      cookie: `${INVITATION_PROOF_COOKIE}=${encodeURIComponent(createInvitationProof(token))}`,
    },
  });
}

beforeAll(async () => {
  const role = await prisma.role.findUnique({ where: { key: "contributor" } });
  if (!role)
    throw new Error("Run the capability seed before integration tests.");
});

describe("identity and access database boundary", () => {
  it("keeps the executable Better Auth security policy pinned", () => {
    expect(auth.options.session).toMatchObject({
      expiresIn: 43_200,
      disableSessionRefresh: true,
      freshAge: 300,
      cookieCache: { enabled: false },
    });
    expect(auth.options.account).toMatchObject({
      updateAccountOnSignIn: false,
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      accountLinking: { enabled: false, disableImplicitLinking: true },
    });
    expect(auth.options.socialProviders?.google).toMatchObject({
      hd: domain,
      accessType: "online",
      prompt: "login",
      disableImplicitSignUp: true,
      disableIdTokenSignIn: true,
      overrideUserInfoOnSignIn: true,
    });
    const googleProvider = auth.options.socialProviders?.google;
    expect(googleProvider).not.toBeTypeOf("function");
    if (typeof googleProvider !== "function") {
      expect(googleProvider?.getUserInfo).toBeTypeOf("function");
    }
    expect(auth.options.advanced).toMatchObject({
      ipAddress: {
        disableIpTracking: false,
        ipAddressHeaders: [RATE_LIMIT_IDENTITY_HEADER],
      },
      crossSubDomainCookies: { enabled: false },
    });
    expect(auth.options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
    });
    expect(auth.options.databaseHooks?.session?.create?.after).toBeTypeOf(
      "function",
    );
  });

  it("enforces the sign-in limit through shared PostgreSQL state", async () => {
    await prisma.rateLimit.deleteMany();
    const rawClientAddress = "203.0.113.87";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await auth.handler(
        withPseudonymousRateLimitIdentity(
          new Request("http://127.0.0.1:3000/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              origin: "http://127.0.0.1:3000",
              "content-type": "application/json",
              "x-vercel-forwarded-for": rawClientAddress,
            },
            body: JSON.stringify({
              provider: "google",
              callbackURL: "/admin",
            }),
          }),
          {
            authSecret:
              "integration-test-secret-that-is-at-least-32-characters",
            isVercel: true,
          },
        ),
      );
      statuses.push(response.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    const storedRateLimit = await prisma.rateLimit.findFirstOrThrow();
    expect(storedRateLimit.key).toContain("|/sign-in/social");
    expect(storedRateLimit.key).not.toContain(rawClientAddress);
  });

  it("requires the exact invitation before AuthUser creation and activates atomically before session", async () => {
    const suffix = randomUUID();
    const email = `activation-${suffix}@${domain}`;
    const token = randomBytes(32).toString("base64url");
    const userId = `activation-user-${suffix}`;
    const accountId = `activation-account-${suffix}`;
    const subject = `google-sub-${suffix}`;
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "contributor" },
    });
    const invitation = await prisma.adminInvitation.create({
      data: {
        email,
        hostedDomain: domain,
        tokenDigest: digestInvitationToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        intendedRoles: { create: [{ roleId: role.id }] },
      },
    });
    const request = invitationRequest(token);

    await expect(
      verifyInvitationBeforeAuthUserCreate(
        { email, emailVerified: true, workspaceDomain: domain },
        request,
      ),
    ).resolves.toMatchObject({ email, emailVerified: true });

    await prisma.user.create({
      data: {
        id: userId,
        name: "Invited Admin",
        email,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        accountId: subject,
        providerId: "google",
        userId,
      },
    });

    const activated = await activateAndRequirePrincipalBeforeSession(
      userId,
      request,
    );
    expect(activated.status).toBe("ACTIVE");

    const persisted = await prisma.adminUser.findUniqueOrThrow({
      where: { id: activated.id },
      include: {
        externalIdentities: true,
        roleAssignments: true,
      },
    });
    expect(persisted.externalIdentities).toHaveLength(1);
    expect(persisted.externalIdentities[0]?.subject).toBe(subject);
    expect(persisted.roleAssignments).toHaveLength(1);
    await expect(
      prisma.adminInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).resolves.toMatchObject({
      status: "ACCEPTED",
      acceptedById: activated.id,
    });
    await expect(
      prisma.auditEvent.count({
        where: {
          action: "admin.invitation.accept",
          targetId: activated.id,
        },
      }),
    ).resolves.toBe(1);

    // A later login needs no invitation proof and resolves the stable subject.
    await expect(
      activateAndRequirePrincipalBeforeSession(
        userId,
        new Request("http://127.0.0.1:3000/api/auth/callback/google"),
      ),
    ).resolves.toMatchObject({ id: activated.id, status: "ACTIVE" });
    await expect(
      recordAuthenticationAudit(userId, "admin.auth.login.success"),
    ).resolves.toBe(true);
    await expect(
      prisma.auditEvent.count({
        where: {
          action: "admin.auth.login.success",
          targetId: activated.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rejects wrong-email invitation proof before AuthUser persistence", async () => {
    const suffix = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await prisma.adminInvitation.create({
      data: {
        email: `intended-${suffix}@${domain}`,
        hostedDomain: domain,
        tokenDigest: digestInvitationToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await expect(
      verifyInvitationBeforeAuthUserCreate(
        {
          email: `different-${suffix}@${domain}`,
          emailVerified: true,
          workspaceDomain: domain,
        },
        invitationRequest(token),
      ),
    ).rejects.toBeInstanceOf(APIError);
  });

  it("accepts only freshly verified Workspace identity fields on repeat-login updates", () => {
    expect(
      verifyIdentityClaimsBeforeAuthUserUpdate({
        email: `ADMINISTRATOR@${domain.toUpperCase()}`,
        emailVerified: true,
        workspaceDomain: domain.toUpperCase(),
        name: "Current Google Profile",
      }),
    ).toMatchObject({
      email: `administrator@${domain}`,
      emailVerified: true,
      workspaceDomain: domain,
    });
    expect(() =>
      verifyIdentityClaimsBeforeAuthUserUpdate({
        email: `administrator@${domain}`,
        emailVerified: false,
        workspaceDomain: domain,
      }),
    ).toThrow(APIError);
    expect(() =>
      verifyIdentityClaimsBeforeAuthUserUpdate({
        email: `administrator@${domain}`,
        emailVerified: true,
        workspaceDomain: "other.example.org",
      }),
    ).toThrow(APIError);
  });

  it("consumes one invitation exactly once under concurrent session activation", async () => {
    const suffix = randomUUID();
    const email = `race-${suffix}@${domain}`;
    const token = randomBytes(32).toString("base64url");
    const userId = `race-user-${suffix}`;
    const accountId = `race-account-${suffix}`;
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "contributor" },
    });
    const invitation = await prisma.adminInvitation.create({
      data: {
        email,
        hostedDomain: domain,
        tokenDigest: digestInvitationToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        intendedRoles: { create: [{ roleId: role.id }] },
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        name: "Concurrent Admin",
        email,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        accountId: `race-sub-${suffix}`,
        providerId: "google",
        userId,
      },
    });
    const request = invitationRequest(token);

    const outcomes = await Promise.allSettled([
      activateAndRequirePrincipalBeforeSession(userId, request),
      activateAndRequirePrincipalBeforeSession(userId, request),
    ]);
    expect(
      outcomes.filter(({ status }) => status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.externalIdentity.count({ where: { authUserId: userId } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { action: "admin.invitation.accept", targetId: { not: null } },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "admin.invitation.accept",
          summary: { path: ["invitationId"], equals: invitation.id },
        },
      }),
    ).toBe(1);
    await expect(
      prisma.adminInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
  });

  it("enforces provider-token and minimized-session constraints", async () => {
    const suffix = randomUUID();
    const userId = `constraint-user-${suffix}`;
    await prisma.user.create({
      data: {
        id: userId,
        name: "Constraint User",
        email: `constraint-${suffix}@${domain}`,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });

    await expect(
      prisma.account.create({
        data: {
          id: `constraint-account-${suffix}`,
          accountId: `constraint-sub-${suffix}`,
          providerId: "google",
          userId,
          accessToken: "must-not-persist",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.session.create({
        data: {
          id: `constraint-session-${suffix}`,
          token: randomBytes(32).toString("base64url"),
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          ipAddress: "127.0.0.1",
        },
      }),
    ).rejects.toThrow();
  });

  it("defaults new local administrators to deny-only invited status", async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        id: `default-status-user-${suffix}`,
        name: "Invited by Default",
        email: `default-status-${suffix}@${domain}`,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });

    await expect(
      prisma.adminUser.create({ data: { authUserId: user.id } }),
    ).resolves.toMatchObject({ status: "INVITED" });
  });

  it("prevents a second provider subject from claiming an existing email", async () => {
    const suffix = randomUUID();
    const email = `subject-anchor-${suffix}@${domain}`;
    const user = await prisma.user.create({
      data: {
        id: `subject-anchor-user-${suffix}`,
        name: "Original Subject",
        email,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });
    await prisma.account.create({
      data: {
        id: `subject-anchor-account-${suffix}`,
        accountId: `original-sub-${suffix}`,
        providerId: "google",
        userId: user.id,
      },
    });

    await expect(
      prisma.user.create({
        data: {
          id: `different-sub-user-${suffix}`,
          name: "Different Subject",
          email,
          emailVerified: true,
          workspaceDomain: domain,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.account.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
  });

  it("keeps audit evidence append-only", async () => {
    const audit = await prisma.auditEvent.create({
      data: {
        actorKind: "SYSTEM",
        action: "integration.append_only.verify",
        targetType: "IntegrationTest",
        outcome: "SUCCEEDED",
        correlationId: randomUUID(),
        summary: { containsSecrets: false },
      },
    });

    await expect(
      prisma.auditEvent.update({
        where: { id: audit.id },
        data: { action: "integration.mutation_attempt" },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a direct unauthorized invitation mutation without side effects", async () => {
    const suffix = randomUUID();
    const actorAdminUserId = suffix;
    const email = `unauthorized-invite-${suffix}@${domain}`;
    const now = new Date();

    await expect(
      createAdminInvitation(
        {
          adminUserId: actorAdminUserId,
          authUserId: `unauthorized-auth-${suffix}`,
          capabilities: [],
          email: `unauthorized-actor-${suffix}@${domain}`,
          isSuperAdmin: false,
          name: "Unauthorized Actor",
          sessionCreatedAt: now,
          sessionExpiresAt: new Date(now.getTime() + 60_000),
          sessionId: `unauthorized-session-${suffix}`,
        },
        {
          email,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          roleKeys: ["contributor"],
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      prisma.adminInvitation.count({ where: { email } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEvent.count({
        where: {
          action: "admin.invitation.create",
          actorAdminUserId,
        },
      }),
    ).resolves.toBe(0);
  });

  it("expires a stale bootstrap invitation before safely issuing a replacement", async () => {
    const suffix = randomUUID();
    const createdAt = new Date();
    const helperNow = new Date(createdAt.getTime() + 2 * 60 * 1000);
    const stale = await prisma.adminInvitation.create({
      data: {
        email: `stale-bootstrap-${suffix}@${domain}`,
        hostedDomain: domain,
        tokenDigest: digestInvitationToken(
          randomBytes(32).toString("base64url"),
        ),
        expiresAt: new Date(createdAt.getTime() + 60_000),
        isSuperAdminBootstrap: true,
      },
    });

    const replacement = await createInitialSuperAdminInvitation(
      prisma,
      {
        appBaseUrl: "http://127.0.0.1:3000",
        email: `replacement-bootstrap-${suffix}@${domain}`,
        expectedDomain: domain,
      },
      helperNow,
    );

    await expect(
      prisma.adminInvitation.findUniqueOrThrow({ where: { id: stale.id } }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
    await expect(
      prisma.adminInvitation.findUniqueOrThrow({
        where: { id: replacement.invitationId },
      }),
    ).resolves.toMatchObject({
      status: "PENDING",
      isSuperAdminBootstrap: true,
    });
  });

  it("suspends against an expected version, revokes grants, and deletes sessions", async () => {
    const suffix = randomUUID();
    const userId = `suspension-user-${suffix}`;
    const accountId = `suspension-account-${suffix}`;
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "platform-admin" },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: "Suspension Admin",
        email: `suspension-${suffix}@${domain}`,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });
    const account = await prisma.account.create({
      data: {
        id: accountId,
        accountId: `suspension-sub-${suffix}`,
        providerId: "google",
        userId,
      },
    });
    const admin = await prisma.adminUser.create({
      data: {
        authUserId: userId,
        status: "ACTIVE",
        externalIdentities: {
          create: {
            authUserId: userId,
            authAccountId: account.id,
            provider: "GOOGLE",
            subject: account.accountId,
            email: user.email,
            emailVerified: true,
            hostedDomain: domain,
          },
        },
        roleAssignments: {
          create: {
            roleId: role.id,
            assignmentReason: "Suspension integration fixture",
          },
        },
      },
    });
    await prisma.session.create({
      data: {
        id: `suspension-session-${suffix}`,
        token: randomBytes(32).toString("base64url"),
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress: null,
        userAgent: null,
      },
    });
    const now = new Date();
    const principal = {
      adminUserId: admin.id,
      authUserId: userId,
      capabilities: role.permissions
        .map(({ permission }) => permission.key)
        .filter((capability) => capability === "users.suspend"),
      email: user.email,
      isSuperAdmin: false,
      name: user.name,
      sessionCreatedAt: now,
      sessionExpiresAt: new Date(now.getTime() + 60_000),
      sessionId: `suspension-session-${suffix}`,
    } as const;
    await expect(
      suspendAdminUser(
        { ...principal, capabilities: [] },
        admin.id,
        admin.version,
        "Security review suspension",
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      suspendAdminUser(
        {
          ...principal,
          sessionCreatedAt: new Date(now.getTime() - 10 * 60 * 1000),
        },
        admin.id,
        admin.version,
        "Security review suspension",
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      suspendAdminUser(
        principal,
        admin.id,
        admin.version + 1,
        "Security review suspension",
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } }),
    ).resolves.toMatchObject({ status: "ACTIVE", version: admin.version });
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { action: "admin.user.suspend", targetId: admin.id },
      }),
    ).resolves.toBe(0);

    const result = await suspendAdminUser(
      principal,
      admin.id,
      admin.version,
      "Security review suspension",
      now,
    );

    expect(result).toMatchObject({
      status: "SUSPENDED",
      revokedAssignments: 1,
      revokedSessions: 1,
    });
    await expect(
      prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } }),
    ).resolves.toMatchObject({
      status: "SUSPENDED",
      version: admin.version + 1,
    });
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
    await expect(
      prisma.userRole.count({
        where: { adminUserId: admin.id, revokedAt: null },
      }),
    ).resolves.toBe(0);
  });

  it("lets one fresh current Super Admin explicitly promote another active administrator", async () => {
    const suffix = randomUUID();
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "super-admin" },
      include: { permissions: { include: { permission: true } } },
    });
    const [actorUser, targetUser] = await Promise.all([
      prisma.user.create({
        data: {
          id: `promotion-actor-user-${suffix}`,
          name: "Promotion Actor",
          email: `promotion-actor-${suffix}@${domain}`,
          emailVerified: true,
          workspaceDomain: domain,
        },
      }),
      prisma.user.create({
        data: {
          id: `promotion-target-user-${suffix}`,
          name: "Promotion Target",
          email: `promotion-target-${suffix}@${domain}`,
          emailVerified: true,
          workspaceDomain: domain,
        },
      }),
    ]);
    const actor = await prisma.adminUser.create({
      data: {
        authUserId: actorUser.id,
        status: "ACTIVE",
        roleAssignments: {
          create: {
            roleId: role.id,
            assignmentReason: "Integration Super Admin actor",
          },
        },
        superAdminGrant: {
          create: { reason: "Integration initial Super Admin" },
        },
      },
    });
    const target = await prisma.adminUser.create({
      data: {
        authUserId: targetUser.id,
        status: "ACTIVE",
        roleAssignments: {
          create: {
            roleId: role.id,
            grantedById: actor.id,
            revokedAt: new Date(Date.now() - 60_000),
            revokedById: actor.id,
            assignmentReason: "Historical assignment",
            revocationReason: "Historical integration revocation",
          },
        },
      },
    });
    const now = new Date();
    const principal = {
      adminUserId: actor.id,
      authUserId: actorUser.id,
      capabilities: role.permissions
        .map(({ permission }) => permission.key)
        .filter((key) => key === "users.roles.assign"),
      email: actorUser.email,
      isSuperAdmin: true,
      name: actorUser.name,
      sessionCreatedAt: now,
      sessionExpiresAt: new Date(now.getTime() + 60_000),
      sessionId: `promotion-session-${suffix}`,
    } as const;

    await expect(
      promoteAdminUserToSuperAdmin(
        { ...principal, capabilities: [] },
        target.id,
        target.version,
        "Operational continuity promotion",
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      promoteAdminUserToSuperAdmin(
        {
          ...principal,
          sessionCreatedAt: new Date(now.getTime() - 10 * 60 * 1000),
        },
        target.id,
        target.version,
        "Operational continuity promotion",
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      promoteAdminUserToSuperAdmin(
        { ...principal, isSuperAdmin: false },
        target.id,
        target.version,
        "Operational continuity promotion",
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      promoteAdminUserToSuperAdmin(
        principal,
        target.id,
        target.version + 1,
        "Operational continuity promotion",
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.superAdminGrant.count({ where: { adminUserId: target.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEvent.count({
        where: { action: "admin.super_admin.promote", targetId: target.id },
      }),
    ).resolves.toBe(0);

    const result = await promoteAdminUserToSuperAdmin(
      principal,
      target.id,
      target.version,
      "Operational continuity promotion",
      now,
    );

    expect(result.status).toBe("PROMOTED");
    await expect(
      prisma.superAdminGrant.findUnique({
        where: { adminUserId: target.id },
      }),
    ).resolves.toMatchObject({ grantedById: actor.id });
    await expect(
      prisma.userRole.count({
        where: { adminUserId: target.id, roleId: role.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.userRole.count({
        where: { adminUserId: target.id, roleId: role.id, revokedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: {
          action: "admin.super_admin.promote",
          actorAdminUserId: actor.id,
          targetId: target.id,
        },
      }),
    ).resolves.toBe(1);
  });
});
