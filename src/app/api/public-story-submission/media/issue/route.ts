import { NextResponse } from "next/server";

import { issuePublicStorySubmissionMediaUpload } from "@/modules/communications/submissions/submission-media-service";
import { submissionMediaMimeTypes } from "@/modules/communications/submissions/submission-media-content";

import {
  booleanField,
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
    const declaredMimeType = text("declaredMimeType");
    if (
      !declaredMimeType ||
      !(submissionMediaMimeTypes as readonly string[]).includes(
        declaredMimeType,
      )
    ) {
      return NextResponse.json(
        {
          code: "UNSUPPORTED_FORMAT",
          message: "This file type isn’t supported.",
        },
        { status: 400 },
      );
    }
    const sensitivity = {
      involvesMinor: booleanField(text("involvesMinor"), "involvesMinor"),
      involvesHomeownerOrApplicant: booleanField(
        text("involvesHomeownerOrApplicant"),
        "involvesHomeownerOrApplicant",
      ),
      involvesOtherIdentifiablePerson: booleanField(
        text("involvesOtherIdentifiablePerson"),
        "involvesOtherIdentifiablePerson",
      ),
      depictsPrivateResidence: booleanField(
        text("depictsPrivateResidence"),
        "depictsPrivateResidence",
      ),
      containsSensitivePersonalCircumstances: booleanField(
        text("containsSensitivePersonalCircumstances"),
        "containsSensitivePersonalCircumstances",
      ),
    };
    const result = await issuePublicStorySubmissionMediaUpload(
      runtime.database,
      {
        recoveryToken: text("recoveryToken") ?? "",
        expectedAttemptVersion: positiveInteger(
          text("expectedAttemptVersion"),
          "attempt version",
        ),
        declaredMimeType,
        originalFilename: text("originalFilename"),
        description: text("description"),
        suggestedPhotoCredit: text("suggestedPhotoCredit"),
        sensitivity,
        uploadAuthorizationSecret:
          runtime.environment.publicStorySubmissionsSecret!,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return safeError(error);
  }
}
