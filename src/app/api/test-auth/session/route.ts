import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import { buildAuditEvent } from "@/platform/audit/event";
import { readServerEnvironment } from "@/platform/config/environment";
import { prisma } from "@/platform/database/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  fixture: z.enum([
    "platform-admin",
    "story-contributor",
    "story-editor",
    "story-manager",
    "news-contributor",
    "news-editor",
    "news-manager",
    "dashboard-contributor",
    "dashboard-only",
    "denied",
  ]),
});

const fixtureRoleKeys = {
  "platform-admin": "platform-admin",
  "story-contributor": "contributor",
  "story-editor": "editor",
  "story-manager": "communications-manager",
  "news-contributor": "contributor",
  "news-editor": "editor",
  "news-manager": "communications-manager",
} as const;

const testOnlyFixtureCapabilities = {
  "dashboard-contributor": [
    "communications.dashboard.read",
    "communications.queue.read",
    "stories.read.draft.own",
    "news.read.draft.own",
  ],
  "dashboard-only": ["communications.dashboard.read"],
} as const;

function unavailable() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

function isLoopback(hostname: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signBetterAuthCookie(token: string, secret: string) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

export async function POST(request: Request) {
  const environment = readServerEnvironment();
  const requestUrl = new URL(request.url);
  const suppliedSecret = request.headers.get("x-test-auth-secret") ?? "";
  const origin = request.headers.get("origin");

  if (
    !environment.enableTestAuth ||
    !environment.testAuthSecret ||
    !isLoopback(new URL(environment.appBaseUrl).hostname) ||
    !isLoopback(requestUrl.hostname) ||
    (origin !== null && origin !== environment.appBaseUrl) ||
    !secureEqual(suppliedSecret, environment.testAuthSecret)
  ) {
    return unavailable();
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return unavailable();

  const suffix = randomUUID();
  const authUserId = `test-user-${suffix}`;
  const authAccountId = `test-account-${suffix}`;
  const subject = `test-subject-${suffix}`;
  const email = `e2e-${suffix}@${environment.googleWorkspaceDomain}`;
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionId = `test-session-${suffix}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  await prisma.$transaction(async (transaction) => {
    await transaction.user.create({
      data: {
        id: authUserId,
        name: "E2E Foundation Admin",
        email,
        emailVerified: true,
        workspaceDomain: environment.googleWorkspaceDomain,
      },
    });
    await transaction.account.create({
      data: {
        id: authAccountId,
        accountId: subject,
        providerId: "google",
        userId: authUserId,
      },
    });

    if (parsed.data.fixture !== "denied") {
      const customCapabilities =
        parsed.data.fixture in testOnlyFixtureCapabilities
          ? testOnlyFixtureCapabilities[
              parsed.data.fixture as keyof typeof testOnlyFixtureCapabilities
            ]
          : null;
      const roleKey = customCapabilities
        ? `test-${parsed.data.fixture}`
        : fixtureRoleKeys[parsed.data.fixture as keyof typeof fixtureRoleKeys];
      const role = customCapabilities
        ? await transaction.role.upsert({
            where: { key: roleKey },
            create: {
              key: roleKey,
              name: `Test ${parsed.data.fixture}`,
              description: "Ephemeral E2E capability fixture.",
              isSystem: false,
              isActive: true,
            },
            update: {
              name: `Test ${parsed.data.fixture}`,
              description: "Ephemeral E2E capability fixture.",
              isActive: true,
            },
          })
        : await transaction.role.findUnique({
            where: { key: roleKey },
          });
      if (!role?.isActive) throw new Error(`Seeded ${roleKey} role missing.`);
      if (customCapabilities) {
        const permissions = await transaction.permission.findMany({
          where: { key: { in: [...customCapabilities] } },
          select: { id: true },
        });
        if (permissions.length !== customCapabilities.length) {
          throw new Error(`Seeded test capabilities missing for ${roleKey}.`);
        }
        await transaction.rolePermission.deleteMany({
          where: {
            roleId: role.id,
            permissionId: { notIn: permissions.map(({ id }) => id) },
          },
        });
        await transaction.rolePermission.createMany({
          data: permissions.map(({ id }) => ({
            roleId: role.id,
            permissionId: id,
          })),
          skipDuplicates: true,
        });
      }
      const adminUser = await transaction.adminUser.create({
        data: { authUserId, status: "ACTIVE" },
      });
      await transaction.externalIdentity.create({
        data: {
          adminUserId: adminUser.id,
          authUserId,
          authAccountId,
          provider: "GOOGLE",
          subject,
          email,
          emailVerified: true,
          hostedDomain: environment.googleWorkspaceDomain,
        },
      });
      await transaction.userRole.create({
        data: {
          adminUserId: adminUser.id,
          roleId: role.id,
          assignmentReason: "Isolated E2E fixture",
        },
      });
      await transaction.auditEvent.create({
        data: buildAuditEvent({
          actorKind: "SYSTEM",
          action: "test_auth.fixture.create",
          targetType: "AdminUser",
          targetId: adminUser.id,
          summary: { fixture: parsed.data.fixture, roleKey },
        }),
      });
    }

    // This direct insert is the only test-only seam. Protected application
    // code still resolves the real database session and local capability joins.
    await transaction.session.create({
      data: {
        id: sessionId,
        token: sessionToken,
        userId: authUserId,
        createdAt: now,
        updatedAt: now,
        expiresAt,
        ipAddress: null,
        userAgent: null,
      },
    });
  });

  const signedCookie = signBetterAuthCookie(
    sessionToken,
    environment.authSecret,
  );
  const response = Response.json({ ok: true });
  response.headers.append(
    "set-cookie",
    `better-auth.session_token=${signedCookie}; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax`,
  );
  return response;
}
