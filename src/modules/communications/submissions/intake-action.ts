"use server";

import { headers } from "next/headers";

import { prisma } from "@/platform/database/prisma";
import { readServerEnvironment } from "@/platform/config/environment";

import { submitPublicStorySubmission } from "./intake-service";
import type { PublicStoryIntakeOutcome } from "./intake-contract";

/**
 * Server Action seam for the future progressive-enhancement form. No public
 * page imports it in C6B-1B, and the service remains disabled by default.
 */
export async function submitPublicStorySubmissionAction(
  formData: FormData,
): Promise<PublicStoryIntakeOutcome> {
  const requestHeaders = new Headers(await headers());
  const configuredOrigin = new URL(readServerEnvironment().appBaseUrl);
  requestHeaders.set("origin", configuredOrigin.origin);
  requestHeaders.set("sec-fetch-site", "same-origin");
  requestHeaders.set("sec-fetch-mode", "same-origin");
  if (!requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "multipart/form-data;");
  }
  const result = await submitPublicStorySubmission(
    formData,
    { headers: requestHeaders },
    { prisma },
  );
  return result;
}
