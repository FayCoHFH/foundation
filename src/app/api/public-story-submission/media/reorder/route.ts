import { NextResponse } from "next/server";

import { reorderPublicStorySubmissionMedia } from "@/modules/communications/submissions/submission-media-service";

import {
  positiveInteger,
  runtimeRequest,
  safeError,
  unavailable,
} from "../_shared";

export async function POST(request: Request) {
  try {
    const runtime = runtimeRequest(request);
    if (!runtime) return unavailable();
    const body = await request.formData();
    const text = (name: string) => {
      const value = body.get(name);
      return typeof value === "string" ? value : null;
    };
    let mediaIds: unknown;
    try {
      mediaIds = JSON.parse(text("mediaIds") ?? "null");
    } catch {
      return unavailable();
    }
    if (
      !Array.isArray(mediaIds) ||
      mediaIds.length > 10 ||
      mediaIds.some((id) => typeof id !== "string")
    )
      return unavailable();
    const result = await reorderPublicStorySubmissionMedia(runtime.database, {
      recoveryToken: text("recoveryToken") ?? "",
      expectedAttemptVersion: positiveInteger(
        text("expectedAttemptVersion"),
        "attempt version",
      ),
      mediaIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    return safeError(error);
  }
}
