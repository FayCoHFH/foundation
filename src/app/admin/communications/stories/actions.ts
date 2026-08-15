"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveStory,
  createStory,
  requestStoryChanges,
  saveStoryRevision,
  sendStoryForApproval,
  storyDocumentFromPlainText,
  submitStory,
} from "@/modules/communications/stories";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, AuthorizationError } from "@/platform/errors/app-error";

export type StoryFormValues = {
  headline: string;
  deck: string;
  excerpt: string;
  body: string;
};

export type StoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  storyId?: string;
  values: StoryFormValues;
  fieldErrors?: Partial<Record<keyof StoryFormValues, string>>;
};

export type StoryWorkflowActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

const storyFormSchema = z.object({
  headline: z
    .string()
    .trim()
    .min(1, "Enter a Story title.")
    .max(180, "Use 180 characters or fewer."),
  deck: z.string().trim().max(300, "Use 300 characters or fewer."),
  excerpt: z
    .string()
    .trim()
    .min(1, "Enter a concise excerpt.")
    .max(600, "Use 600 characters or fewer."),
  body: z
    .string()
    .trim()
    .min(1, "Enter Story body text.")
    .max(30_000, "Story body is too long."),
});

const revisionSchema = z.object({
  storyId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
});

const workflowSchema = revisionSchema.extend({
  expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/),
  action: z.enum(["submit", "request-changes", "send-for-approval", "approve"]),
  reason: z.preprocess((value) => value ?? "", z.string().trim().max(1_000)),
});

function valuesFromForm(formData: FormData): StoryFormValues {
  return {
    headline: String(formData.get("headline") ?? "").trim(),
    deck: String(formData.get("deck") ?? "").trim(),
    excerpt: String(formData.get("excerpt") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
  };
}

function errorState(
  values: StoryFormValues,
  message: string,
  fieldErrors?: StoryActionState["fieldErrors"],
): StoryActionState {
  return {
    status: "error",
    message,
    values,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

async function currentPrincipal() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  return access.principal;
}

function toSafeMessage(error: unknown) {
  if (error instanceof AppError && error.expose) return error.message;
  return "The Story action could not be completed. Please try again.";
}

function parseCandidate(formData: FormData):
  | {
      values: StoryFormValues;
      candidate: ReturnType<typeof storyDocumentFromPlainText>;
    }
  | { error: StoryActionState } {
  const values = valuesFromForm(formData);
  const parsed = storyFormSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      error: errorState(values, "Correct the highlighted Story fields.", {
        ...(fields.headline?.[0] ? { headline: fields.headline[0] } : {}),
        ...(fields.deck?.[0] ? { deck: fields.deck[0] } : {}),
        ...(fields.excerpt?.[0] ? { excerpt: fields.excerpt[0] } : {}),
        ...(fields.body?.[0] ? { body: fields.body[0] } : {}),
      }),
    };
  }
  try {
    return { values, candidate: storyDocumentFromPlainText(parsed.data.body) };
  } catch (error) {
    return {
      error: errorState(values, toSafeMessage(error), {
        body: toSafeMessage(error),
      }),
    };
  }
}

export async function createStoryAction(
  _previous: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  try {
    const story = await createStory(prisma, await currentPrincipal(), {
      headline: parsed.values.headline,
      deck: parsed.values.deck || null,
      excerpt: parsed.values.excerpt,
      body: parsed.candidate,
    });
    revalidatePath("/admin/communications/stories");
    return {
      status: "success",
      storyId: story.storyId,
      message: "Story draft created.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function saveStoryRevisionAction(
  _previous: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  const revision = revisionSchema.safeParse({
    storyId: formData.get("storyId"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (!revision.success)
    return errorState(parsed.values, "Reload the Story draft before saving.");
  try {
    await saveStoryRevision(prisma, await currentPrincipal(), {
      storyId: revision.data.storyId,
      expectedVersion: revision.data.expectedVersion,
      headline: parsed.values.headline,
      deck: parsed.values.deck || null,
      excerpt: parsed.values.excerpt,
      body: parsed.candidate,
    });
    revalidatePath(`/admin/communications/stories/${revision.data.storyId}`);
    return {
      status: "success",
      message: "A new immutable Story revision was saved.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function storyWorkflowAction(
  _previous: StoryWorkflowActionState,
  formData: FormData,
): Promise<StoryWorkflowActionState> {
  const parsed = workflowSchema.safeParse({
    storyId: formData.get("storyId"),
    expectedVersion: formData.get("expectedVersion"),
    expectedContentHash: formData.get("expectedContentHash"),
    action: formData.get("action"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Reload the Story draft before continuing.",
    };
  }
  const input = {
    storyId: parsed.data.storyId,
    expectedVersion: parsed.data.expectedVersion,
    expectedContentHash: parsed.data.expectedContentHash,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
  };
  try {
    const principal = await currentPrincipal();
    switch (parsed.data.action) {
      case "submit":
        await submitStory(prisma, principal, input);
        break;
      case "request-changes":
        await requestStoryChanges(prisma, principal, input);
        break;
      case "send-for-approval":
        await sendStoryForApproval(prisma, principal, input);
        break;
      case "approve":
        await approveStory(prisma, principal, input);
        break;
    }
    revalidatePath(`/admin/communications/stories/${input.storyId}`);
    return {
      status: "success",
      message:
        parsed.data.action === "submit"
          ? "Story submitted for review."
          : parsed.data.action === "request-changes"
            ? "Changes were requested."
            : parsed.data.action === "send-for-approval"
              ? "Story advanced for approval."
              : "Story approved for its exact current revision.",
    };
  } catch (error) {
    return { status: "error", message: toSafeMessage(error) };
  }
}
