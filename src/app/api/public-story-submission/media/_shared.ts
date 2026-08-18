import { NextResponse } from "next/server";

import { readServerEnvironment } from "@/platform/config/environment";
import { AppError, ValidationError } from "@/platform/errors/app-error";
import { prisma } from "@/platform/database/prisma";
import { getRuntimeSubmissionQuarantineStorage } from "@/platform/storage";
import { validatePublicStorySubmissionRequestContext } from "@/modules/communications/submissions/intake-request";

export function unavailable() {
  return NextResponse.json(
    {
      code: "UNAVAILABLE",
      message: "Story submissions are not available right now.",
    },
    { status: 503 },
  );
}

export function safeError(error: unknown) {
  if (error instanceof AppError && error.expose) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      code: "UNAVAILABLE",
      message: "We couldn’t complete that image step right now.",
    },
    { status: 503 },
  );
}

export function runtimeRequest(request: Request) {
  const environment = readServerEnvironment();
  if (
    !environment.publicStorySubmissionsEnabled ||
    !environment.publicStorySubmissionsSecret
  ) {
    return null;
  }
  if (
    !validatePublicStorySubmissionRequestContext(request.headers, {
      appOrigin: environment.appBaseUrl,
      appEnv: environment.appEnv,
    })
  ) {
    throw new ValidationError("The request could not be verified.");
  }
  const storage = getRuntimeSubmissionQuarantineStorage();
  if (!storage) return null;
  return { environment, storage, database: prisma };
}

export function booleanField(value: string | null, name: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ValidationError(`${name} must be true or false.`);
}

export function positiveInteger(value: string | null, name: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${name} is invalid.`);
  }
  return parsed;
}
