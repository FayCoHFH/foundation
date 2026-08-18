import { z } from "zod";

const appEnvironmentSchema = z.enum([
  "development",
  "test",
  "preview",
  "production",
]);

const rawEnvironmentSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_PREVIOUS_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1).optional(),
  AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  ENABLE_TEST_AUTH: z.enum(["true", "false"]).default("false"),
  TEST_AUTH_SECRET: z.string().min(32).optional(),
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  LOCAL_STORAGE_ROOT: z.string().default(".data/storage"),
  PUBLIC_STORAGE_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PUBLIC_STORY_SUBMISSIONS_ENABLED: z.enum(["true", "false"]).default("false"),
  PUBLIC_STORY_SUBMISSIONS_SECRET: z.string().min(32).optional(),
  PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional(),
  DONORVIEW_APPROVED_HOSTS: z.string().optional(),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export type ServerEnvironment = ReturnType<typeof readServerEnvironment>;

function normalizeWorkspaceDomain(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function isLoopbackHostname(hostname: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function parseExactOrigin(value: string, variableName: string) {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  const normalizedInput = trimmed.replace(/\/$/, "");

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    trimmed.includes("*") ||
    url.origin !== normalizedInput
  ) {
    throw new Error(
      `${variableName} must contain exact HTTP(S) origins without credentials, paths, queries, fragments, or wildcards: ${trimmed}`,
    );
  }

  return url.origin;
}

function parseTrustedOrigins(
  baseOrigin: string,
  configured: string | undefined,
) {
  const origins = new Set([baseOrigin]);

  for (const candidate of configured?.split(",") ?? []) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    origins.add(parseExactOrigin(trimmed, "AUTH_TRUSTED_ORIGINS"));
  }

  return [...origins];
}

export function readServerEnvironment(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = rawEnvironmentSchema.parse(source);
  const appEnv = parsed.APP_ENV;
  const isDeployment = appEnv === "preview" || appEnv === "production";
  const isVercel = parsed.VERCEL === "1" || Boolean(parsed.VERCEL_ENV);
  const enableTestAuth = parsed.ENABLE_TEST_AUTH === "true";
  const appOrigin = parseExactOrigin(parsed.APP_BASE_URL, "APP_BASE_URL");
  const authOrigin = parseExactOrigin(
    parsed.BETTER_AUTH_URL ?? parsed.APP_BASE_URL,
    "BETTER_AUTH_URL",
  );
  const authEnabled =
    parsed.AUTH_ENABLED === undefined
      ? appEnv !== "preview"
      : parsed.AUTH_ENABLED === "true";

  if (authOrigin !== appOrigin) {
    throw new Error(
      "BETTER_AUTH_URL must equal APP_BASE_URL for the single-origin application.",
    );
  }

  if (
    parsed.VERCEL_ENV &&
    parsed.VERCEL_ENV !== appEnv &&
    !(parsed.VERCEL_ENV === "development" && appEnv === "development")
  ) {
    throw new Error(
      `APP_ENV=${appEnv} must match VERCEL_ENV=${parsed.VERCEL_ENV}.`,
    );
  }
  if (
    parsed.NODE_ENV === "production" &&
    appOrigin.startsWith("https://") &&
    appEnv === "development"
  ) {
    throw new Error(
      "An HTTPS production runtime cannot be classified as APP_ENV=development.",
    );
  }

  if (enableTestAuth) {
    if (appEnv !== "test" || isVercel || isDeployment) {
      throw new Error(
        "ENABLE_TEST_AUTH is permitted only in an isolated local/CI APP_ENV=test runtime and never on Vercel.",
      );
    }
    if (!parsed.TEST_AUTH_SECRET) {
      throw new Error(
        "TEST_AUTH_SECRET is required when test auth is enabled.",
      );
    }
    if (!isLoopbackHostname(new URL(parsed.APP_BASE_URL).hostname)) {
      throw new Error(
        "ENABLE_TEST_AUTH requires a loopback APP_BASE_URL in addition to APP_ENV=test.",
      );
    }
  }

  if (isDeployment) {
    if (new URL(parsed.APP_BASE_URL).protocol !== "https:") {
      throw new Error(
        "Preview and production APP_BASE_URL values must use HTTPS.",
      );
    }
    if (!parsed.BETTER_AUTH_SECRET) {
      throw new Error(
        "BETTER_AUTH_SECRET is required in preview and production.",
      );
    }
    if (!parsed.DATABASE_URL) {
      throw new Error("DATABASE_URL is required in preview and production.");
    }
    if (appEnv === "production" && parsed.STORAGE_DRIVER === "local") {
      throw new Error(
        "Production cannot use the ephemeral local storage adapter.",
      );
    }
  }

  if (authEnabled && (appEnv === "production" || appEnv === "preview")) {
    if (
      !parsed.GOOGLE_CLIENT_ID ||
      !parsed.GOOGLE_CLIENT_SECRET ||
      !parsed.GOOGLE_WORKSPACE_DOMAIN
    ) {
      throw new Error(
        "Enabled deployment authentication requires Google client credentials and GOOGLE_WORKSPACE_DOMAIN.",
      );
    }
  }

  const publicStorySubmissionsEnabled =
    parsed.PUBLIC_STORY_SUBMISSIONS_ENABLED === "true";
  if (publicStorySubmissionsEnabled) {
    if (!parsed.PUBLIC_STORY_SUBMISSIONS_SECRET) {
      throw new Error(
        "PUBLIC_STORY_SUBMISSIONS_SECRET is required when public Story Submissions are enabled.",
      );
    }
    if (
      Buffer.byteLength(parsed.PUBLIC_STORY_SUBMISSIONS_SECRET, "utf8") < 32
    ) {
      throw new Error(
        "PUBLIC_STORY_SUBMISSIONS_SECRET must contain at least 32 bytes.",
      );
    }
    if (!parsed.PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION) {
      throw new Error(
        "PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION is required when public Story Submissions are enabled.",
      );
    }
    if (
      appEnv === "production" &&
      new URL(parsed.APP_BASE_URL).protocol !== "https:"
    ) {
      throw new Error(
        "Production public Story Submission intake requires an HTTPS application origin.",
      );
    }
  }

  return {
    appEnv,
    appBaseUrl: appOrigin,
    authBaseUrl: authOrigin,
    authEnabled,
    authSecret:
      parsed.BETTER_AUTH_SECRET ??
      "development-only-better-auth-secret-change-me",
    previousAuthSecret: parsed.BETTER_AUTH_PREVIOUS_SECRET,
    trustedOrigins: parseTrustedOrigins(appOrigin, parsed.AUTH_TRUSTED_ORIGINS),
    databaseUrl:
      parsed.DATABASE_URL ??
      "postgresql://habitat:habitat@127.0.0.1:5432/habitat_development?schema=public",
    googleClientId: parsed.GOOGLE_CLIENT_ID ?? "google-client-not-configured",
    googleClientSecret:
      parsed.GOOGLE_CLIENT_SECRET ?? "google-secret-not-configured",
    googleWorkspaceDomain:
      normalizeWorkspaceDomain(parsed.GOOGLE_WORKSPACE_DOMAIN) ?? "example.org",
    enableTestAuth,
    testAuthSecret: parsed.TEST_AUTH_SECRET,
    storageDriver: parsed.STORAGE_DRIVER,
    localStorageRoot: parsed.LOCAL_STORAGE_ROOT,
    publicStorageBaseUrl: parsed.PUBLIC_STORAGE_BASE_URL,
    logLevel: parsed.LOG_LEVEL,
    secureCookies: isDeployment || appOrigin.startsWith("https://"),
    isVercel,
    publicStorySubmissionsEnabled,
    publicStorySubmissionsSecret: parsed.PUBLIC_STORY_SUBMISSIONS_SECRET,
    publicStorySubmissionsPrivacyNoticeVersion:
      parsed.PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION,
    donorViewApprovedHosts:
      parsed.DONORVIEW_APPROVED_HOSTS?.split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean) ?? [],
  } as const;
}

export function assertRuntimeEnvironment() {
  return readServerEnvironment();
}
