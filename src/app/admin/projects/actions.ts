"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveProject,
  archiveProject,
  createProject,
  projectDocumentFromPlainText,
  releaseProject,
  requestProjectChanges,
  saveProjectRevision,
  sendProjectForApproval,
  submitProject,
  withdrawProject,
  type ProjectCandidate,
  type ProjectImpactFactInput,
} from "@/modules/communications/projects";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, AuthorizationError } from "@/platform/errors/app-error";

import { PROJECT_STATUSES, PROJECT_TYPES } from "./project-constants";

export type ProjectFormValues = {
  title: string;
  summary: string;
  projectType: string;
  projectStatus: string;
  community: string;
  county: string;
  publicArea: string;
  startDate: string;
  completionDate: string;
  body: string;
  impactFacts: ProjectImpactFactInput[];
};

export type ProjectActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  projectId?: string;
  values: ProjectFormValues;
  fieldErrors?: Partial<Record<keyof ProjectFormValues, string>>;
};

export type ProjectWorkflowActionState = {
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

const projectFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a Project title.").max(160),
  summary: z.string().trim().min(1, "Enter a Project summary.").max(320),
  projectType: z.enum(PROJECT_TYPES as [string, ...string[]]),
  projectStatus: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  community: z.string().trim().min(1, "Enter a community or city.").max(120),
  county: z.string().trim().min(1, "Enter a county.").max(120),
  publicArea: z.string().trim().max(160),
  startDate: z.string().trim(),
  completionDate: z.string().trim(),
  body: z.string().trim().min(1, "Enter Project body text.").max(30_000),
  impactFacts: z.string(),
});

const revisionSchema = z.object({
  projectId: z.string().uuid(),
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

function valuesFromForm(formData: FormData): ProjectFormValues {
  const parseFacts = () => {
    try {
      const parsed = JSON.parse(String(formData.get("impactFacts") ?? "[]"));
      return factsSchema.parse(parsed).map((fact) => ({
        ...fact,
        unit: fact.unit ?? "",
      }));
    } catch {
      return [];
    }
  };
  return {
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    projectType: String(formData.get("projectType") ?? ""),
    projectStatus: String(formData.get("projectStatus") ?? ""),
    community: String(formData.get("community") ?? "").trim(),
    county: String(formData.get("county") ?? "").trim(),
    publicArea: String(formData.get("publicArea") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? ""),
    completionDate: String(formData.get("completionDate") ?? ""),
    body: String(formData.get("body") ?? "").trim(),
    impactFacts: parseFacts(),
  };
}

function errorState(
  values: ProjectFormValues,
  message: string,
  fieldErrors?: ProjectActionState["fieldErrors"],
): ProjectActionState {
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
  return "The Project action could not be completed. Please try again.";
}

function parseCandidate(formData: FormData) {
  const values = valuesFromForm(formData);
  const parsed = projectFormSchema.safeParse({
    ...values,
    impactFacts: formData.get("impactFacts") ?? "[]",
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      error: errorState(values, "Correct the highlighted Project fields.", {
        ...(fields.title?.[0] ? { title: fields.title[0] } : {}),
        ...(fields.summary?.[0] ? { summary: fields.summary[0] } : {}),
        ...(fields.community?.[0] ? { community: fields.community[0] } : {}),
        ...(fields.county?.[0] ? { county: fields.county[0] } : {}),
        ...(fields.body?.[0] ? { body: fields.body[0] } : {}),
        ...(fields.impactFacts?.[0]
          ? { impactFacts: fields.impactFacts[0] }
          : {}),
      }),
    } as const;
  }
  try {
    const facts = factsSchema
      .parse(JSON.parse(parsed.data.impactFacts))
      .map((fact) => ({ ...fact, unit: fact.unit ?? "" }));
    const dateValue = (value: string) =>
      value ? new Date(`${value}T00:00:00.000Z`) : null;
    const candidate: ProjectCandidate = {
      title: parsed.data.title,
      summary: parsed.data.summary,
      projectType: parsed.data.projectType as ProjectCandidate["projectType"],
      projectStatus: parsed.data
        .projectStatus as ProjectCandidate["projectStatus"],
      community: parsed.data.community,
      county: parsed.data.county,
      publicArea: parsed.data.publicArea || null,
      startDate: dateValue(parsed.data.startDate),
      completionDate: dateValue(parsed.data.completionDate),
      body: projectDocumentFromPlainText(parsed.data.body),
      impactFacts: facts,
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

export async function createProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  try {
    const project = await createProject(
      prisma,
      await currentPrincipal(),
      parsed.candidate,
    );
    revalidatePath("/admin/projects");
    return {
      status: "success",
      projectId: project.projectId,
      message: "Project draft created.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function saveProjectRevisionAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = parseCandidate(formData);
  if ("error" in parsed) return parsed.error;
  const revision = revisionSchema.safeParse({
    projectId: formData.get("projectId"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (!revision.success)
    return errorState(parsed.values, "Reload the Project before saving.");
  try {
    await saveProjectRevision(prisma, await currentPrincipal(), {
      ...parsed.candidate,
      projectId: revision.data.projectId,
      expectedVersion: revision.data.expectedVersion,
    });
    revalidatePath(`/admin/projects/${revision.data.projectId}`);
    revalidatePath("/admin/projects");
    return {
      status: "success",
      message: "A new immutable Project revision was saved.",
      values: parsed.values,
    };
  } catch (error) {
    return errorState(parsed.values, toSafeMessage(error));
  }
}

export async function projectWorkflowAction(
  _previous: ProjectWorkflowActionState,
  formData: FormData,
): Promise<ProjectWorkflowActionState> {
  const parsed = workflowSchema.safeParse({
    projectId: formData.get("projectId"),
    expectedVersion: formData.get("expectedVersion"),
    expectedContentHash: formData.get("expectedContentHash"),
    action: formData.get("action"),
    reason: formData.get("reason") ?? "",
    slug: formData.get("slug") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Reload the Project before continuing.",
    };
  }
  const input = {
    projectId: parsed.data.projectId,
    expectedVersion: parsed.data.expectedVersion,
    expectedContentHash: parsed.data.expectedContentHash,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
  };
  try {
    const principal = await currentPrincipal();
    switch (parsed.data.action) {
      case "submit":
        await submitProject(prisma, principal, input);
        break;
      case "request-changes":
        await requestProjectChanges(prisma, principal, input);
        break;
      case "send-for-approval":
        await sendProjectForApproval(prisma, principal, input);
        break;
      case "approve":
        await approveProject(prisma, principal, input);
        break;
      case "release":
        await releaseProject(prisma, principal, {
          ...input,
          slug: parsed.data.slug,
        });
        break;
      case "withdraw":
        await withdrawProject(prisma, principal, {
          projectId: input.projectId,
          expectedVersion: input.expectedVersion,
          reason: parsed.data.reason || "Administrative withdrawal",
        });
        break;
      case "archive":
        await archiveProject(prisma, principal, {
          projectId: input.projectId,
          expectedVersion: input.expectedVersion,
        });
        break;
    }
    revalidatePath(`/admin/projects/${input.projectId}`);
    revalidatePath("/admin/projects");
    revalidatePath("/projects");
    return {
      status: "success",
      message:
        parsed.data.action === "submit"
          ? "Project submitted for review."
          : parsed.data.action === "request-changes"
            ? "Changes were requested."
            : parsed.data.action === "send-for-approval"
              ? "Project advanced for approval."
              : parsed.data.action === "approve"
                ? "Project approved for its exact current revision."
                : parsed.data.action === "release"
                  ? "Immutable public Project snapshot released."
                  : parsed.data.action === "withdraw"
                    ? "Public Project withdrawn."
                    : "Project removed from ordinary discovery.",
    };
  } catch (error) {
    return { status: "error", message: toSafeMessage(error) };
  }
}
