import { canonicalValueHash } from "@/modules/publishing/hash";
import { ValidationError } from "@/platform/errors/app-error";
import type { ProjectStatus, ProjectType } from "@/generated/prisma/client";

import {
  storyDocumentFromPlainText,
  validateStoryDocument,
  type StoryDocument,
} from "../stories/content";

export const PROJECT_CONTENT_HASH_VERSION = 1;
export const PROJECT_BODY_SCHEMA_VERSION = 1;
export const PROJECT_MAX_IMPACT_FACTS = 10;
export const PROJECT_TYPES = [
  "NEW_HOME",
  "HOME_REPAIR",
  "REHABILITATION",
  "ACCESSIBILITY",
  "COMMUNITY",
  "OTHER",
] as const satisfies readonly ProjectType[];
export const PROJECT_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "PAUSED",
  "CANCELLED",
] as const satisfies readonly ProjectStatus[];
export const PROJECT_ACTIVE_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "PAUSED",
] as const satisfies readonly ProjectStatus[];

export type ProjectDocument = StoryDocument;

export type ProjectImpactFactInput = Readonly<{
  label: string;
  value: string;
  unit?: string | null;
  sortOrder: number;
}>;

export type ProjectCandidate = Readonly<{
  title: string;
  summary: string;
  projectType: ProjectType;
  projectStatus: ProjectStatus;
  community: string;
  county: string;
  publicArea?: string | null;
  startDate?: Date | null;
  completionDate?: Date | null;
  body: ProjectDocument;
  impactFacts: readonly ProjectImpactFactInput[];
}>;

function reject(message: string): never {
  throw new ValidationError(message);
}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string") reject(`${label} must be text.`);
  const normalized = value.trim();
  if (required && normalized.length === 0)
    reject(`Enter a ${label.toLowerCase()}.`);
  if (normalized.length > max)
    reject(`${label} must contain ${max} characters or fewer.`);
  return normalized || null;
}

function date(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    reject(`${label} must be a valid calendar date.`);
  }
  return new Date(value.getTime());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateImpactFacts(
  facts: readonly ProjectImpactFactInput[],
): readonly ProjectImpactFactInput[] {
  if (!Array.isArray(facts)) reject("Project impact facts must be a list.");
  if (facts.length > PROJECT_MAX_IMPACT_FACTS) {
    reject(
      `A Project may contain at most ${PROJECT_MAX_IMPACT_FACTS} impact facts.`,
    );
  }
  const seen = new Set<number>();
  const normalized = facts.map((fact) => {
    if (!fact || typeof fact !== "object")
      reject("Project impact fact is invalid.");
    const sortOrder = fact.sortOrder;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      reject("Project impact fact order must be a non-negative integer.");
    }
    if (seen.has(sortOrder))
      reject("Project impact fact order must be unique.");
    seen.add(sortOrder);
    return {
      label: text(fact.label, "Impact fact label", 120)!,
      value: text(fact.value, "Impact fact value", 240)!,
      unit: text(fact.unit, "Impact fact unit", 80, false),
      sortOrder,
    };
  });
  return normalized.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function validateProjectDocument(value: unknown): ProjectDocument {
  return validateStoryDocument(value);
}

export function projectDocumentFromPlainText(value: string): ProjectDocument {
  return storyDocumentFromPlainText(value);
}

export function validateProjectCandidate(
  value: ProjectCandidate,
): ProjectCandidate {
  const title = text(value.title, "Project title", 160)!;
  const summary = text(value.summary, "Project summary", 320)!;
  const community = text(value.community, "Project community", 120)!;
  const county = text(value.county, "Project county", 120)!;
  const publicArea = text(value.publicArea, "Public area", 160, false);
  const startDate = date(value.startDate, "Project start date");
  const completionDate = date(value.completionDate, "Project completion date");
  if (startDate && completionDate && completionDate < startDate) {
    reject("Project completion date cannot be before its start date.");
  }
  if (
    !PROJECT_TYPES.includes(value.projectType) ||
    !PROJECT_STATUSES.includes(value.projectStatus)
  ) {
    reject("Project type and status are required.");
  }
  const body = validateProjectDocument(value.body);
  const impactFacts = validateImpactFacts(value.impactFacts);
  return deepFreeze({
    title,
    summary,
    projectType: value.projectType,
    projectStatus: value.projectStatus,
    community,
    county,
    publicArea,
    startDate,
    completionDate,
    body,
    impactFacts,
  });
}

export function hashProjectCandidate(candidate: ProjectCandidate): string {
  const validated = validateProjectCandidate(candidate);
  return canonicalValueHash({
    kind: "PROJECT",
    title: validated.title,
    summary: validated.summary,
    projectType: validated.projectType,
    projectStatus: validated.projectStatus,
    community: validated.community,
    county: validated.county,
    publicArea: validated.publicArea,
    startDate: validated.startDate?.toISOString() ?? null,
    completionDate: validated.completionDate?.toISOString() ?? null,
    body: validated.body,
    impactFacts: validated.impactFacts,
  });
}

export function isActiveProjectStatus(status: ProjectStatus) {
  return (PROJECT_ACTIVE_STATUSES as readonly string[]).includes(status);
}
