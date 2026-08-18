import { NextResponse } from "next/server";

import { uploadPublicStorySubmissionMedia } from "@/modules/communications/submissions/submission-media-service";

import { runtimeRequest, safeError, unavailable } from "../_shared";

export async function POST(request: Request) {
  try {
    const runtime = runtimeRequest(request);
    if (!runtime) return unavailable();
    const body = await request.formData();
    const file = body.get("file");
    const authorization = body.get("uploadAuthorization");
    const declaredMimeType = body.get("declaredMimeType");
    if (
      !(file instanceof File) ||
      typeof authorization !== "string" ||
      typeof declaredMimeType !== "string"
    )
      return unavailable();
    const result = await uploadPublicStorySubmissionMedia(
      runtime.database,
      runtime.storage,
      {
        uploadAuthorization: authorization,
        uploadAuthorizationSecret:
          runtime.environment.publicStorySubmissionsSecret!,
        body: new Uint8Array(await file.arrayBuffer()),
        declaredMimeType,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return safeError(error);
  }
}
