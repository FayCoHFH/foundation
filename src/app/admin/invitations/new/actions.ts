"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { createAdminInvitation } from "@/platform/auth/invitations";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { AppError } from "@/platform/errors/app-error";
import { logger } from "@/platform/logging/logger";
import { parseEditorialWallTime } from "@/platform/time/editorial";

export type InvitationField = "email" | "roleKey" | "expiresAt";

export type InvitationFormValues = Record<InvitationField, string>;

export type InvitationFormState = {
  status: "idle" | "error" | "success";
  values: InvitationFormValues;
  message?: string;
  fieldErrors?: Partial<Record<InvitationField, string>>;
  invitationUrl?: string;
};

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

function readFormValues(formData: FormData): InvitationFormValues {
  return {
    email: String(formData.get("email") ?? "").trim(),
    roleKey: String(formData.get("roleKey") ?? "").trim(),
    expiresAt: String(formData.get("expiresAt") ?? "").trim(),
  };
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
