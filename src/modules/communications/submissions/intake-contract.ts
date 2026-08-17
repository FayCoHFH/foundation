import type { AppEnvironment } from "@/platform/config/environment";

export const PUBLIC_STORY_INTAKE_FORM_PURPOSE = "public-story-submission";
export const PUBLIC_STORY_INTAKE_TOKEN_VERSION = 1;
export const PUBLIC_STORY_INTAKE_TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const PUBLIC_STORY_INTAKE_CLOCK_SKEW_MS = 5_000;
export const PUBLIC_STORY_INTAKE_MIN_COMPLETION_MS = 1_000;
export const PUBLIC_STORY_INTAKE_MAX_FORM_BYTES = 48 * 1024;
export const PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH = 4_096;
export const PUBLIC_STORY_INTAKE_MAX_HONEYPOT_LENGTH = 128;

export const PUBLIC_STORY_INTAKE_RATE_LIMITS = {
  network: { limit: 10, windowMs: 60 * 60 * 1000 },
  email: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  global: { limit: 200, windowMs: 60 * 60 * 1000 },
} as const;

export type PublicStoryIntakeOutcomeCode =
  | "ACCEPTED"
  | "DUPLICATE_ACCEPTED"
  | "VALIDATION_FAILED"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "SECURITY_REJECTED";

export type PublicStoryIntakeOutcome = Readonly<{
  code: PublicStoryIntakeOutcomeCode;
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
}>;

export type PublicStoryIntakeConfig = Readonly<{
  enabled: boolean;
  secret: string | undefined;
  privacyNoticeVersion: string | undefined;
  appOrigin: string;
  appEnv: AppEnvironment;
  isVercel: boolean;
}>;

export type PublicStoryIntakeRequestContext = Readonly<{
  headers: HeadersInit;
}>;

export const PUBLIC_STORY_INTAKE_SUCCESS_MESSAGE =
  "Thanks for sharing your story.";
export const PUBLIC_STORY_INTAKE_GENERIC_MESSAGE =
  "Story submissions are not available right now.";
export const PUBLIC_STORY_INTAKE_VALIDATION_MESSAGE =
  "Review the highlighted fields and try again.";
