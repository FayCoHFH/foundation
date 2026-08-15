import { AuthorizationError } from "@/platform/errors/app-error";

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const FRESH_AUTH_MAX_AGE_SECONDS = 5 * 60;

export type FreshAuthenticationSubject = {
  sessionCreatedAt: Date;
};

export function assertFreshAuthentication(
  subject: FreshAuthenticationSubject,
  now = new Date(),
  maximumAgeSeconds = FRESH_AUTH_MAX_AGE_SECONDS,
) {
  const age = now.getTime() - subject.sessionCreatedAt.getTime();
  if (age < 0 || age > maximumAgeSeconds * 1000) {
    throw new AuthorizationError(
      "This sensitive action requires a recent Google sign-in.",
    );
  }
}

export function safeAdminNextPath(value: string | null | undefined) {
  if (!value) return "/admin";
  if (
    !value.startsWith("/admin") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return "/admin";
  }
  return value;
}
