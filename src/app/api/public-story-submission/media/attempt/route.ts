import { NextResponse } from "next/server";

import {
  createPublicStorySubmissionAttempt,
  getPublicStorySubmissionAttemptRecovery,
} from "@/modules/communications/submissions/submission-media-service";

import { runtimeRequest, safeError, unavailable } from "../_shared";

export async function POST(request: Request) {
  try {
    const runtime = runtimeRequest(request);
    if (!runtime) return unavailable();
    const body = await request.formData();
    const recoveryToken = body.get("recoveryToken");
    if (recoveryToken !== null && typeof recoveryToken !== "string")
      return unavailable();
    if (typeof recoveryToken === "string" && recoveryToken.length > 0) {
      try {
        const attempt = await getPublicStorySubmissionAttemptRecovery(
          runtime.database,
          recoveryToken,
        );
        if (attempt.status === "ACTIVE" && attempt.expiresAt > new Date()) {
          return NextResponse.json({ recoveryToken, attempt });
        }
      } catch {
        // An unknown or expired browser token is indistinguishable from a new visit.
      }
    }
    const created = await createPublicStorySubmissionAttempt(runtime.database);
    const attempt = await getPublicStorySubmissionAttemptRecovery(
      runtime.database,
      created.recoveryToken,
    );
    return NextResponse.json({ recoveryToken: created.recoveryToken, attempt });
  } catch (error) {
    return safeError(error);
  }
}
