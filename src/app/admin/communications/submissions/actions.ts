"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  acceptPublicStorySubmission,
  beginPublicStorySubmissionReview,
  declinePublicStorySubmission,
  markPublicStorySubmissionFollowUp,
  markPublicStorySubmissionSpam,
  restoreSpamPublicStorySubmission,
  updatePublicStorySubmissionReviewNote,
} from "@/modules/communications/submissions";
import { convertPublicStorySubmissionToStory } from "@/modules/communications/submissions/story-conversion-service";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import {
  AppError,
  AuthorizationError,
  ConcurrencyError,
} from "@/platform/errors/app-error";

import type { SubmissionStatusCode } from "./status";

export type SubmissionWorkflowActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
}>;

export type SubmissionReviewNoteActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  value: string;
  fieldError?: string;
}>;

export type StoryConversionActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  storyId?: string;
}>;

const submissionMutationSchema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  action: z.enum([
    "begin-review",
    "mark-follow-up",
    "resume-review",
    "accept",
    "decline",
    "mark-spam",
    "restore-spam",
  ]),
});

const reviewNoteSchema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  internalReviewNote: z.string().max(2_000, "Use 2,000 characters or fewer."),
});

const storyConversionSchema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  confirmConversion: z.literal("on"),
});

async function currentPrincipal() {
  const access = await resolveAdminAccess();
  if (
    access.status !== "authorized" ||
    !hasCapability(access.principal, "communications.submissions.review")
  ) {
    throw new AuthorizationError();
  }
  return access.principal;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof ConcurrencyError) {
    return "This submission changed in another session. Reload before submitting again.";
  }
  if (error instanceof AppError && error.expose) return error.message;
  return fallback;
}

function redirectAfterMutation(
  submissionId: string,
  code: SubmissionStatusCode,
): never {
  revalidatePath("/admin/communications/submissions");
  revalidatePath(`/admin/communications/submissions/${submissionId}`);
  redirect(
    `/admin/communications/submissions/${submissionId}?submission=${encodeURIComponent(code)}`,
  );
}

export async function submissionWorkflowAction(
  _previousState: SubmissionWorkflowActionState,
  formData: FormData,
): Promise<SubmissionWorkflowActionState> {
  const parsed = submissionMutationSchema.safeParse({
    submissionId: formData.get("submissionId"),
    expectedVersion: formData.get("expectedVersion"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Reload this submission before continuing.",
    };
  }

  let code: SubmissionStatusCode;
  try {
    const principal = await currentPrincipal();
    const input = [
      prisma,
      principal,
      parsed.data.submissionId,
      parsed.data.expectedVersion,
    ] as const;
    switch (parsed.data.action) {
      case "begin-review":
        await beginPublicStorySubmissionReview(...input);
        code = "submission-review-started";
        break;
      case "mark-follow-up":
        await markPublicStorySubmissionFollowUp(...input);
        code = "submission-follow-up-marked";
        break;
      case "resume-review":
        await beginPublicStorySubmissionReview(...input);
        code = "submission-review-resumed";
        break;
      case "accept":
        await acceptPublicStorySubmission(...input);
        code = "submission-accepted";
        break;
      case "decline":
        await declinePublicStorySubmission(...input);
        code = "submission-declined";
        break;
      case "mark-spam":
        await markPublicStorySubmissionSpam(...input);
        code = "submission-marked-spam";
        break;
      case "restore-spam":
        await restoreSpamPublicStorySubmission(...input);
        code = "submission-spam-restored";
        break;
    }
  } catch (error) {
    return {
      status: "error",
      message: actionError(
        error,
        "The Story Submission action could not be completed. Try again.",
      ),
    };
  }
  redirectAfterMutation(parsed.data.submissionId, code);
}

function readNoteValue(formData: FormData) {
  const value = formData.get("internalReviewNote");
  return typeof value === "string" ? value : "";
}

function noteError(
  value: string,
  message: string,
  fieldError?: string,
): SubmissionReviewNoteActionState {
  return {
    status: "error",
    message,
    value: value.slice(0, 2_000),
    ...(fieldError ? { fieldError } : {}),
  };
}

export async function submissionReviewNoteAction(
  _previousState: SubmissionReviewNoteActionState,
  formData: FormData,
): Promise<SubmissionReviewNoteActionState> {
  const value = readNoteValue(formData);
  const parsed = reviewNoteSchema.safeParse({
    submissionId: formData.get("submissionId"),
    expectedVersion: formData.get("expectedVersion"),
    internalReviewNote: value,
  });
  if (!parsed.success) {
    const fieldError =
      parsed.error.flatten().fieldErrors.internalReviewNote?.[0];
    return noteError(
      value,
      fieldError ?? "Reload this submission before saving the note.",
      fieldError,
    );
  }

  try {
    const principal = await currentPrincipal();
    await updatePublicStorySubmissionReviewNote(prisma, principal, {
      submissionId: parsed.data.submissionId,
      expectedVersion: parsed.data.expectedVersion,
      internalReviewNote: parsed.data.internalReviewNote,
    });
  } catch (error) {
    return noteError(
      value,
      actionError(
        error,
        "The internal review note could not be saved. Try again.",
      ),
    );
  }
  redirectAfterMutation(parsed.data.submissionId, "submission-note-updated");
}

export async function convertStorySubmissionAction(
  _previousState: StoryConversionActionState,
  formData: FormData,
): Promise<StoryConversionActionState> {
  const parsed = storyConversionSchema.safeParse({
    submissionId: formData.get("submissionId"),
    expectedVersion: formData.get("expectedVersion"),
    confirmConversion: formData.get("confirmConversion"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Confirm that you want to create a private Story draft.",
    };
  }
  try {
    const principal = await currentPrincipal();
    const result = await convertPublicStorySubmissionToStory(
      prisma,
      principal,
      parsed.data,
    );
    revalidatePath(
      `/admin/communications/submissions/${parsed.data.submissionId}`,
    );
    revalidatePath(`/admin/communications/stories/${result.storyId}`);
    return {
      status: "success",
      storyId: result.storyId,
      message: result.created
        ? "Private Story draft created for editorial handoff."
        : "This submission already has a Story draft.",
    };
  } catch (error) {
    return {
      status: "error",
      message: actionError(
        error,
        "The Story draft could not be created. Reload the submission and try again.",
      ),
    };
  }
}
