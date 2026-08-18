"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveCampaign,
  archiveCampaign,
  campaignDocumentFromPlainText,
  createCampaign,
  releaseCampaign,
  requestCampaignChanges,
  saveCampaignRevision,
  sendCampaignForApproval,
  submitCampaign,
  withdrawCampaign,
  type CampaignActionInput,
  type CampaignCandidate,
} from "@/modules/communications/campaigns";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, AuthorizationError } from "@/platform/errors/app-error";
import {
  CAMPAIGN_ACTION_TYPES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
} from "./campaign-constants";

export type CampaignFormValues = {
  title: string;
  summary: string;
  campaignType: string;
  campaignStatus: string;
  startsAt: string;
  endsAt: string;
  body: string;
  goalStatement: string;
  goalAmountDollars: string;
  progressAmountDollars: string;
  facts: { label: string; value: string; unit: string; sortOrder: number }[];
  projectIds: string[];
  actions: CampaignActionInput[];
};

export type CampaignActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  campaignId?: string;
  values: CampaignFormValues;
  fieldErrors?: Partial<Record<keyof CampaignFormValues, string>>;
};

export type CampaignWorkflowActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

const factsSchema = z.array(
  z.object({
    label: z.string().trim().max(120),
    value: z.string().trim().max(240),
    unit: z.string().trim().max(80).nullable().optional(),
    sortOrder: z.number().int().nonnegative().max(999),
  }),
);

const actionsSchema = z.array(
  z.object({
    actionType: z.enum(CAMPAIGN_ACTION_TYPES as [string, ...string[]]),
    label: z.string().trim().max(80),
    destination: z.string().trim().max(2048),
    sortOrder: z.number().int().nonnegative().max(999),
  }),
);

const campaignFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a Campaign title.").max(160),
  summary: z.string().trim().min(1, "Enter a Campaign summary.").max(320),
  campaignType: z.enum(CAMPAIGN_TYPES as [string, ...string[]]),
  campaignStatus: z.enum(CAMPAIGN_STATUSES as [string, ...string[]]),
  startsAt: z.string().trim(),
  endsAt: z.string().trim(),
  body: z.string().trim().min(1, "Enter Campaign body text.").max(30_000),
  goalStatement: z.string().trim().max(240),
  goalAmountDollars: z.string().trim(),
  progressAmountDollars: z.string().trim(),
  facts: z.string(),
  projectIds: z.string(),
  actions: z.string(),
});

const revisionSchema = z.object({
  campaignId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
});

const workflowSchema = revisionSchema.extend({
  expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/),
  action: z.enum([
    "submit",
    "request-changes",
    "send-for-approval",
    "approve",
    "release",
    "withdraw",
    "archive",
  ]),
  slug: z.string().trim().max(160),
  reason: z.string().trim().max(1_000),
});

function valuesFromForm(formData: FormData): CampaignFormValues {
  const parseJson = <T>(name: string, fallback: T): T => {
    try {
      return JSON.parse(String(formData.get(name) ?? "")) as T;
    } catch {
      return fallback;
    }
  };
  const facts = (() => {
    try {
      return factsSchema.parse(parseJson("facts", [])).map((fact) => ({
        ...fact,
        unit: fact.unit ?? "",
      }));
    } catch {
      return [];
    }
  })();
  const actions = (() => {
    try {
      return actionsSchema.parse(
        parseJson("actions", []),
      ) as CampaignActionInput[];
    } catch {
      return [];
    }
  })();
  return {
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    campaignType: String(formData.get("campaignType") ?? ""),
    campaignStatus: String(formData.get("campaignStatus") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    body: String(formData.get("body") ?? "").trim(),
    goalStatement: String(formData.get("goalStatement") ?? "").trim(),
    goalAmountDollars: String(formData.get("goalAmountDollars") ?? "").trim(),
    progressAmountDollars: String(
      formData.get("progressAmountDollars") ?? "",
    ).trim(),
    facts,
    projectIds: parseJson<string[]>("projectIds", []),
    actions,
  };
}

function errorState(
  values: CampaignFormValues,
  message: string,
  fieldErrors?: CampaignActionState["fieldErrors"],
): CampaignActionState {
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
  return "The Campaign action could not be completed. Please try again.";
}

function dollarsToCents(value: string, label: string) {
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error(`${label} must be a non-negative dollar amount.`);
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents))
    throw new Error(`${label} is outside the supported range.`);
  return cents;
}

function parseCandidate(formData: FormData) {
  const values = valuesFromForm(formData);
  const parsed = campaignFormSchema.safeParse({
    ...values,
    facts: formData.get("facts") ?? "[]",
    projectIds: formData.get("projectIds") ?? "[]",
    actions: formData.get("actions") ?? "[]",
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      error: errorState(values, "Correct the highlighted Campaign fields.", {
        ...(fields.title?.[0] ? { title: fields.title[0] } : {}),
        ...(fields.summary?.[0] ? { summary: fields.summary[0] } : {}),
        ...(fields.body?.[0] ? { body: fields.body[0] } : {}),
        ...(fields.facts?.[0] ? { facts: fields.facts[0] } : {}),
        ...(fields.actions?.[0] ? { actions: fields.actions[0] } : {}),
      }),
    } as const;
  }
  try {
    const facts = factsSchema
      .parse(JSON.parse(parsed.data.facts))
      .map((fact) => ({
        ...fact,
        unit: fact.unit ?? null,
      }));
    const actions = actionsSchema.parse(
      JSON.parse(parsed.data.actions),
    ) as CampaignActionInput[];
    const projectIds = z
      .array(z.string().uuid())
      .parse(JSON.parse(parsed.data.projectIds));
    const dateValue = (value: string) =>
      value ? new Date(`${value}T00:00:00.000Z`) : null;
    const candidate: CampaignCandidate = {
      title: parsed.data.title,
      summary: parsed.data.summary,
      campaignType: parsed.data
        .campaignType as CampaignCandidate["campaignType"],
      campaignStatus: parsed.data
        .campaignStatus as CampaignCandidate["campaignStatus"],
      startsAt: dateValue(parsed.data.startsAt),
      endsAt: dateValue(parsed.data.endsAt),
      body: campaignDocumentFromPlainText(parsed.data.body),
      goalStatement: parsed.data.goalStatement || null,
      goalAmountCents: dollarsToCents(parsed.data.goalAmountDollars, "Goal"),
      progressAmountCents: dollarsToCents(
        parsed.data.progressAmountDollars,
        "Progress",
      ),
      currencyCode:
        parsed.data.goalAmountDollars || parsed.data.progressAmountDollars
          ? "USD"
          : null,
      facts,
      projectIds,
      actions,
    };
    return { values, candidate } as const;
  } catch (error) {
    return {
      error: errorState(values, toSafeMessage(error), {
        body: toSafeMessage(error),
      }),
    } as const;
  }
}

export async function createCampaignAction(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  try {
    const campaign = await createCampaign(
      prisma,
      await currentPrincipal(),
      parsed.candidate,
    );
    revalidatePath("/admin/campaigns");
    return {
      status: "success",
      campaignId: campaign.campaignId,
      message: "Campaign draft created.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function saveCampaignRevisionAction(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  const revision = revisionSchema.safeParse({
    campaignId: formData.get("campaignId"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (!revision.success)
    return errorState(parsed.values, "Reload the Campaign before saving.");
  try {
    await saveCampaignRevision(prisma, await currentPrincipal(), {
      ...parsed.candidate,
      campaignId: revision.data.campaignId,
      expectedVersion: revision.data.expectedVersion,
    });
    revalidatePath(`/admin/campaigns/${revision.data.campaignId}`);
    revalidatePath("/admin/campaigns");
    return {
      status: "success",
      message: "A new immutable Campaign revision was saved.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function campaignWorkflowAction(
  _previous: CampaignWorkflowActionState,
  formData: FormData,
): Promise<CampaignWorkflowActionState> {
  const parsed = workflowSchema.safeParse({
    campaignId: formData.get("campaignId"),
    expectedVersion: formData.get("expectedVersion"),
    expectedContentHash: formData.get("expectedContentHash"),
    action: formData.get("action"),
    reason: formData.get("reason") ?? "",
    slug: formData.get("slug") ?? "",
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Reload the Campaign before continuing.",
    };
  const input = {
    campaignId: parsed.data.campaignId,
    expectedVersion: parsed.data.expectedVersion,
    expectedContentHash: parsed.data.expectedContentHash,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
  };
  try {
    const principal = await currentPrincipal();
    switch (parsed.data.action) {
      case "submit":
        await submitCampaign(prisma, principal, input);
        break;
      case "request-changes":
        await requestCampaignChanges(prisma, principal, input);
        break;
      case "send-for-approval":
        await sendCampaignForApproval(prisma, principal, input);
        break;
      case "approve":
        await approveCampaign(prisma, principal, input);
        break;
      case "release":
        await releaseCampaign(prisma, principal, {
          ...input,
          slug: parsed.data.slug,
        });
        break;
      case "withdraw":
        await withdrawCampaign(prisma, principal, {
          campaignId: input.campaignId,
          expectedVersion: input.expectedVersion,
          reason: parsed.data.reason || "Administrative withdrawal",
        });
        break;
      case "archive":
        await archiveCampaign(prisma, principal, {
          campaignId: input.campaignId,
          expectedVersion: input.expectedVersion,
        });
        break;
    }
    revalidatePath(`/admin/campaigns/${input.campaignId}`);
    revalidatePath("/admin/campaigns");
    revalidatePath("/campaigns");
    if (parsed.data.slug) revalidatePath(`/campaigns/${parsed.data.slug}`);
    return {
      status: "success",
      message:
        parsed.data.action === "submit"
          ? "Campaign submitted for review."
          : parsed.data.action === "request-changes"
            ? "Changes were requested."
            : parsed.data.action === "send-for-approval"
              ? "Campaign advanced for approval."
              : parsed.data.action === "approve"
                ? "Campaign approved for its exact current revision."
                : parsed.data.action === "release"
                  ? "Immutable public Campaign snapshot released."
                  : parsed.data.action === "withdraw"
                    ? "Public Campaign withdrawn."
                    : "Campaign removed from ordinary discovery.",
    };
  } catch (error) {
    return { status: "error", message: toSafeMessage(error) };
  }
}
