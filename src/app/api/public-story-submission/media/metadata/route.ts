import { NextResponse } from "next/server";

import { updatePublicStorySubmissionMediaMetadata } from "@/modules/communications/submissions/submission-media-service";

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
    const result = await updatePublicStorySubmissionMediaMetadata(
      runtime.database,
      {
        recoveryToken: text("recoveryToken") ?? "",
        mediaId: text("mediaId") ?? "",
        expectedMediaVersion: positiveInteger(
          text("expectedMediaVersion"),
          "media version",
        ),
        description: text("description"),
        suggestedPhotoCredit: text("suggestedPhotoCredit"),
        sensitivity: {
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
        },
      },
    );
    return NextResponse.json({ media: result });
  } catch (error) {
    return safeError(error);
  }
}
