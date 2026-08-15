"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { createAdminInvitation } from "@/platform/auth/invitations";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { AppError } from "@/platform/errors/app-error";
import { logger } from "@/platform/logging/logger";

export type InvitationField = "email" | "roleKey" | "expiresAt";

export type InvitationFormValues = Record<InvitationField, string>;

export type InvitationFormState = {
  status: "idle" | "error" | "success";
  values: InvitationFormValues;
  message?: string;
  fieldErrors?: Partial<Record<InvitationField, string>>;
  invitationUrl?: string;
};

const EDITORIAL_TIME_ZONE = "America/Chicago";
const DATE_TIME_LOCAL_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const REQUEST_CORRELATION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

const invitationFieldsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter the invited administrator's email address.")
    .max(254, "Enter an email address with 254 characters or fewer.")
    .pipe(z.email("Enter a valid email address.")),
  roleKey: z
    .string()
    .trim()
    .min(1, "Choose an initial role preset.")
    .max(100, "Choose a valid initial role preset.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Choose a valid initial role preset."),
  expiresAt: z.string().trim().min(1, "Choose an invitation expiry."),
});

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const editorialTimeFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    timeZone: EDITORIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

function readFormValues(formData: FormData): InvitationFormValues {
  return {
    email: String(formData.get("email") ?? "").trim(),
    roleKey: String(formData.get("roleKey") ?? "").trim(),
    expiresAt: String(formData.get("expiresAt") ?? "").trim(),
  };
}

function formatInEditorialTimeZone(timestamp: number): WallClockParts {
  const parts = Object.fromEntries(
    editorialTimeFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function sameWallClock(left: WallClockParts, right: WallClockParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function offsetAt(timestamp: number) {
  const local = formatInEditorialTimeZone(timestamp);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  return localAsUtc - Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
}

function parseEditorialWallTime(
  value: string,
): { date: Date } | { error: string } {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match?.groups) {
    return { error: "Enter a complete invitation expiry date and time." };
  }

  const requested: WallClockParts = {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
  };
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const calendarRoundTrip = new Date(wallClockAsUtc);
  if (
    calendarRoundTrip.getUTCFullYear() !== requested.year ||
    calendarRoundTrip.getUTCMonth() + 1 !== requested.month ||
    calendarRoundTrip.getUTCDate() !== requested.day ||
    calendarRoundTrip.getUTCHours() !== requested.hour ||
    calendarRoundTrip.getUTCMinutes() !== requested.minute
  ) {
    return { error: "Enter a valid invitation expiry date and time." };
  }

  /*
   * `datetime-local` carries no offset. Resolve it against the accepted
   * editorial timezone by sampling the offsets on both sides of a possible
   * DST transition, then round-trip candidate instants through Intl. Zero
   * candidates is a skipped wall time; two candidates is a repeated wall time.
   */
  const offsets = new Set(
    [-2 * DAY_MS, -DAY_MS, 0, DAY_MS, 2 * DAY_MS].map((distance) =>
      offsetAt(wallClockAsUtc + distance),
    ),
  );
  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset)
    .filter((timestamp) =>
      sameWallClock(formatInEditorialTimeZone(timestamp), requested),
    );

  if (candidates.length === 0) {
    return {
      error:
        "That time does not exist in America/Chicago because the clock changes. Choose another time.",
    };
  }
  if (candidates.length > 1) {
    return {
      error:
        "That time occurs twice in America/Chicago because the clock changes. Choose another time.",
    };
  }

  return { date: new Date(candidates[0]!) };
}

function fieldErrorsFromZod(
  error: z.ZodError<InvitationFormValues>,
): Partial<Record<InvitationField, string>> {
  const flattened = error.flatten().fieldErrors;
  return {
    ...(flattened.email?.[0] ? { email: flattened.email[0] } : {}),
    ...(flattened.roleKey?.[0] ? { roleKey: flattened.roleKey[0] } : {}),
    ...(flattened.expiresAt?.[0] ? { expiresAt: flattened.expiresAt[0] } : {}),
  };
}

function errorState(
  values: InvitationFormValues,
  message: string,
  fieldErrors?: Partial<Record<InvitationField, string>>,
): InvitationFormState {
  return {
    status: "error",
    values,
    message,
    ...(fieldErrors && Object.keys(fieldErrors).length > 0
      ? { fieldErrors }
      : {}),
  };
}

function requestCorrelationId(requestHeaders: Headers) {
  for (const headerName of ["x-request-id", "x-correlation-id"]) {
    const candidate = requestHeaders.get(headerName)?.trim();
    if (candidate && REQUEST_CORRELATION_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function exposedAppErrorState(
  error: AppError,
  values: InvitationFormValues,
): InvitationFormState {
  if (
    error.code === "AUTHENTICATION_REQUIRED" ||
    error.code === "AUTHORIZATION_DENIED"
  ) {
    return errorState(
      values,
      "Your session cannot perform this action. Sign in again or contact an administrator.",
    );
  }
  if (error.code === "INVALID_INPUT") {
    if (error.message.includes("Workspace domain")) {
      return errorState(values, "Review the highlighted field.", {
        email: error.message,
      });
    }
    if (error.message.startsWith("Invitation expiry")) {
      return errorState(values, "Review the highlighted field.", {
        expiresAt: error.message,
      });
    }
    if (error.message.includes("role preset")) {
      return errorState(values, "Review the highlighted field.", {
        roleKey: error.message,
      });
    }
  }
  if (error.code === "PRECONDITION_FAILED") {
    return errorState(values, "Review the highlighted field.", {
      roleKey: error.message,
    });
  }
  return errorState(values, error.message);
}

export async function createInvitationAction(
  _previousState: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const values = readFormValues(formData);
  let correlationId: string = randomUUID();

  try {
    const requestHeaders = await headers();
    correlationId = requestCorrelationId(requestHeaders) ?? correlationId;
    const access = await resolveAdminAccess(requestHeaders);
    if (access.status !== "authorized") {
      return errorState(
        values,
        "Your session cannot perform this action. Sign in again or contact an administrator.",
      );
    }

    const parsedFields = invitationFieldsSchema.safeParse(values);
    if (!parsedFields.success) {
      return errorState(
        values,
        "Review the highlighted fields and submit the invitation again.",
        fieldErrorsFromZod(parsedFields.error),
      );
    }
    const expiryResult = parseEditorialWallTime(parsedFields.data.expiresAt);
    if ("error" in expiryResult) {
      return errorState(values, "Review the highlighted field.", {
        expiresAt: expiryResult.error,
      });
    }

    const result = await createAdminInvitation(access.principal, {
      email: parsedFields.data.email,
      roleKeys: [parsedFields.data.roleKey],
      expiresAt: expiryResult.date,
    });
    return {
      status: "success",
      values,
      message: "Invitation created and recorded in the audit log.",
      invitationUrl: result.invitationUrl,
    };
  } catch (error) {
    if (error instanceof AppError && error.expose) {
      return exposedAppErrorState(error, values);
    }
    if (!(error instanceof AppError)) {
      logger.error("admin.invitation.create.unexpected_error", {
        correlationId,
        operation: "admin.invitation.create",
      });
    }
    return errorState(
      values,
      "The invitation could not be created. Review the fields or try again.",
    );
  }
}
