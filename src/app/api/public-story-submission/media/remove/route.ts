import { NextResponse } from "next/server";

import { removePublicStorySubmissionMedia } from "@/modules/communications/submissions/submission-media-service";

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
    const result = await removePublicStorySubmissionMedia(
      runtime.database,
      runtime.storage,
      {
        recoveryToken: text("recoveryToken") ?? "",
        mediaId: text("mediaId") ?? "",
        expectedMediaVersion: positiveInteger(
          text("expectedMediaVersion"),
          "media version",
        ),
      },
    );
    return NextResponse.json({ media: result });
  } catch (error) {
    return safeError(error);
  }
}
