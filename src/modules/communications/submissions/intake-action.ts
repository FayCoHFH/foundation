"use server";

import { headers } from "next/headers";

import { prisma } from "@/platform/database/prisma";

import { submitPublicStorySubmission } from "./intake-service";
import type { PublicStoryIntakeOutcome } from "./intake-contract";

/**
 * Server Action seam for the future progressive-enhancement form. No public
 * page imports it in C6B-1B, and the service remains disabled by default.
 */
export async function submitPublicStorySubmissionAction(
  formData: FormData,
): Promise<PublicStoryIntakeOutcome> {
  return submitPublicStorySubmission(
    formData,
    { headers: await headers() },
    { prisma },
  );
}
