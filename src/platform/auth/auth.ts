import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import {
  activateAndRequirePrincipalBeforeSession,
  verifyIdentityClaimsBeforeAuthUserUpdate,
  verifyInvitationBeforeAuthUserCreate,
} from "@/platform/auth/invitation-activation";
import { recordAuthenticationAudit } from "@/platform/auth/auth-audit";
import { AUTH_SCHEMA_OPTIONS } from "@/platform/auth/schema-options";
import { verifiedGoogleCallbackUserInfo } from "@/platform/auth/google-profile";
import { INVITATION_PROOF_COOKIE } from "@/platform/auth/invitation-proof";
import { RATE_LIMIT_IDENTITY_HEADER } from "@/platform/auth/rate-limit-identity";
import {
  FRESH_AUTH_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
} from "@/platform/auth/policy";
import { readServerEnvironment } from "@/platform/config/environment";
import { prisma } from "@/platform/database/prisma";

const environment = readServerEnvironment();
const versionedSecrets = [
  { version: 1, value: environment.authSecret },
  ...(environment.previousAuthSecret
    ? [{ version: 0, value: environment.previousAuthSecret }]
    : []),
];

function stripProviderCredentials<T extends Record<string, unknown>>(data: T) {
  return {
    ...data,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    password: null,
  };
}

export const auth = betterAuth({
  appName: "Fayette County Habitat for Humanity Administration",
  baseURL: environment.authBaseUrl,
  basePath: "/api/auth",
  secret: environment.authSecret,
  secrets: versionedSecrets,
  trustedOrigins: environment.trustedOrigins,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  ...AUTH_SCHEMA_OPTIONS,
  socialProviders: {
    google: {
      clientId: environment.googleClientId,
      clientSecret: environment.googleClientSecret,
      accessType: "online",
      prompt: "login",
      hd: environment.googleWorkspaceDomain,
      disableImplicitSignUp: true,
      disableIdTokenSignIn: true,
      overrideUserInfoOnSignIn: true,
      getUserInfo: (token) =>
        verifiedGoogleCallbackUserInfo(
          token,
          environment.googleClientId,
          environment.googleWorkspaceDomain,
        ),
    },
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    disableSessionRefresh: true,
    freshAge: FRESH_AUTH_MAX_AGE_SECONDS,
    cookieCache: { enabled: false },
  },
  account: {
    updateAccountOnSignIn: false,
    encryptOAuthTokens: true,
    storeAccountCookie: false,
    accountLinking: {
      enabled: false,
      disableImplicitLinking: true,
    },
  },
  advanced: {
    useSecureCookies: environment.secureCookies,
    // The route adapter writes only a keyed pseudonym to this internal header.
    // Other runtimes receive a single fail-closed bucket rather than trusting
    // arbitrary proxy headers.
    ipAddress: {
      disableIpTracking: false,
      ipAddressHeaders: [RATE_LIMIT_IDENTITY_HEADER],
    },
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: environment.secureCookies,
      path: "/",
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => ({
          data: await verifyInvitationBeforeAuthUserCreate(
            {
              email: user.email,
              emailVerified: user.emailVerified,
              workspaceDomain: user.workspaceDomain,
            },
            context?.request,
          ),
        }),
      },
      update: {
        before: async (user) => ({
          data: verifyIdentityClaimsBeforeAuthUserUpdate(user),
        }),
      },
    },
    account: {
      create: {
        before: async (account) => ({
          data: stripProviderCredentials(account),
        }),
      },
      update: {
        before: async (account) => ({
          data: stripProviderCredentials(account),
        }),
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          await activateAndRequirePrincipalBeforeSession(
            session.userId,
            context?.request,
          );
          return {
            data: {
              ...session,
              ipAddress: null,
              userAgent: null,
            },
          };
        },
        after: async (session, context) => {
          await recordAuthenticationAudit(
            session.userId,
            "admin.auth.login.success",
          );
          context?.setCookie(INVITATION_PROOF_COOKIE, "", {
            httpOnly: true,
            secure: environment.secureCookies,
            sameSite: "lax",
            path: "/api/auth",
            maxAge: 0,
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
