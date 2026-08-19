import { canonicalValueHash } from "@/modules/publishing/hash";
import { ValidationError } from "@/platform/errors/app-error";
import type {
  CampaignActionType,
  CampaignStatus,
  CampaignType,
} from "@/generated/prisma/client";

import {
  storyDocumentFromPlainText,
  validateStoryDocument,
  type StoryDocument,
} from "../stories/content";

export const CAMPAIGN_CONTENT_HASH_VERSION = 1;
export const CAMPAIGN_BODY_SCHEMA_VERSION = 1;
export const CAMPAIGN_MAX_FACTS = 10;
export const CAMPAIGN_MAX_ACTIONS = 5;
export const CAMPAIGN_MAX_AMOUNT_CENTS = 100_000_000_000_000;

export const CAMPAIGN_TYPES = [
  "FUNDRAISING",
  "MATCHING_GIFT",
  "VOLUNTEER",
  "AWARENESS",
  "SPONSORSHIP",
  "SPECIAL_INITIATIVE",
  "OTHER",
] as const satisfies readonly CampaignType[];

export const CAMPAIGN_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "CANCELLED",
] as const satisfies readonly CampaignStatus[];

export const CAMPAIGN_ACTION_TYPES = [
  "DONATE",
  "VOLUNTEER",
  "LEARN_MORE",
] as const satisfies readonly CampaignActionType[];

export const CAMPAIGN_CURRENT_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "PAUSED",
] as const satisfies readonly CampaignStatus[];

export const CAMPAIGN_HISTORICAL_STATUSES = [
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly CampaignStatus[];

export function usablePublicExternalDestination(
  value: string | null | undefined,
) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hostname ||
    hostname.endsWith(".invalid")
  ) {
    return null;
  }
  return url.toString();
}

export type CampaignDocument = StoryDocument;

export type CampaignFactInput = Readonly<{
  label: string;
  value: string;
  unit?: string | null;
  sortOrder: number;
}>;

export type CampaignActionInput = Readonly<{
  actionType: CampaignActionType;
  label: string;
  destination?: string | null;
  destinationId?: string | null;
  sortOrder: number;
}>;

export type CampaignCandidate = Readonly<{
  title: string;
  summary: string;
  campaignType: CampaignType;
  campaignStatus: CampaignStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  body: CampaignDocument;
  goalStatement?: string | null;
  goalAmountCents?: number | null;
  progressAmountCents?: number | null;
  currencyCode?: string | null;
  facts: readonly CampaignFactInput[];
  projectIds?: readonly string[];
  actions?: readonly CampaignActionInput[];
}>;

type ValidatedCampaignCandidate = Omit<
  CampaignCandidate,
  | "startsAt"
  | "endsAt"
  | "goalStatement"
  | "goalAmountCents"
  | "progressAmountCents"
  | "currencyCode"
  | "projectIds"
> & {
  startsAt: Date | null;
  endsAt: Date | null;
  goalStatement: string | null;
  goalAmountCents: number | null;
  progressAmountCents: number | null;
  currencyCode: string | null;
  projectIds: readonly string[];
  actions: readonly CampaignActionInput[];
};

function reject(message: string): never {
  throw new ValidationError(message);
}

function text(value: unknown, label: string, max: number, required = true) {
  if (value === null || value === undefined) {
    if (!required) return null;
    reject(`${label} must be text.`);
  }
  if (typeof value !== "string") reject(`${label} must be text.`);
  const normalized = value.trim();
  if (required && normalized.length === 0) {
    reject(`Enter a ${label.toLowerCase()}.`);
  }
  if (normalized.length > max) {
    reject(`${label} must contain ${max} characters or fewer.`);
  }
  return normalized || null;
}

function instant(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    reject(`${label} must be a valid date and time.`);
  }
  return new Date(value.getTime());
}

function amount(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") {
    reject(`${label} must be a non-negative whole number of cents.`);
  }
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > CAMPAIGN_MAX_AMOUNT_CENTS
  ) {
    reject(
      `${label} must be a non-negative whole number of cents no greater than ${CAMPAIGN_MAX_AMOUNT_CENTS}.`,
    );
  }
  return value;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateProjectIds(values: readonly string[] | undefined) {
  if (values !== undefined && !Array.isArray(values)) {
    reject("Campaign Project relationships must be a list.");
  }
  const projectIds = values ?? [];
  const seen = new Set<string>();
  return projectIds.map((projectId) => {
    if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
      reject("Campaign Project relationships must use valid identifiers.");
    }
    if (seen.has(projectId)) {
      reject("A Campaign cannot link the same Project more than once.");
    }
    seen.add(projectId);
    return projectId;
  });
}

function validateFacts(facts: readonly CampaignFactInput[]) {
  if (!Array.isArray(facts)) reject("Campaign facts must be a list.");
  if (facts.length > CAMPAIGN_MAX_FACTS) {
    reject(`A Campaign may contain at most ${CAMPAIGN_MAX_FACTS} facts.`);
  }
  const seen = new Set<number>();
  const normalized = facts.map((fact) => {
    if (!fact || typeof fact !== "object") reject("Campaign fact is invalid.");
    if (
      !Number.isInteger(fact.sortOrder) ||
      fact.sortOrder < 0 ||
      fact.sortOrder > 999
    ) {
      reject("Campaign fact order must be a non-negative integer.");
    }
    if (seen.has(fact.sortOrder)) {
      reject("Campaign fact order must be unique.");
    }
    seen.add(fact.sortOrder);
    return {
      label: text(fact.label, "Campaign fact label", 120)!,
      value: text(fact.value, "Campaign fact value", 240)!,
      unit: text(fact.unit, "Campaign fact unit", 80, false),
      sortOrder: fact.sortOrder,
    };
  });
  return normalized.sort((left, right) => left.sortOrder - right.sortOrder);
}

function validateActions(actions: readonly CampaignActionInput[] | undefined) {
  const values = actions ?? [];
  if (!Array.isArray(values)) reject("Campaign actions must be a list.");
  if (values.length > CAMPAIGN_MAX_ACTIONS) {
    reject(`A Campaign may contain at most ${CAMPAIGN_MAX_ACTIONS} actions.`);
  }
  const seen = new Set<number>();
  return values
    .map((action) => {
      if (!action || typeof action !== "object")
        reject("Campaign action is invalid.");
      if (!CAMPAIGN_ACTION_TYPES.includes(action.actionType)) {
        reject("Campaign action type is invalid.");
      }
      if (
        !Number.isInteger(action.sortOrder) ||
        action.sortOrder < 0 ||
        action.sortOrder > 999
      ) {
        reject("Campaign action order must be a non-negative integer.");
      }
      if (seen.has(action.sortOrder)) {
        reject("Campaign action order must be unique.");
      }
      seen.add(action.sortOrder);
      const label = text(action.label, "Campaign action label", 80)!;
      const destinationId = action.destinationId?.trim() || null;
      if (destinationId && !UUID_PATTERN.test(destinationId))
        reject("Campaign action destination must use a valid identifier.");
      if (action.actionType === "LEARN_MORE" && destinationId) {
        reject("Learn more actions must use their own HTTPS destination.");
      }
      const destination = text(
        action.destination ?? "",
        "Campaign action destination",
        2_048,
        action.actionType === "LEARN_MORE" || !destinationId,
      );
      if (
        action.actionType !== "LEARN_MORE" &&
        !destinationId &&
        !destination
      ) {
        reject(
          "Donate and Volunteer actions must reference a reviewed destination.",
        );
      }
      if (action.actionType !== "LEARN_MORE" && destinationId && destination) {
        reject("Governed Donate and Volunteer actions cannot copy a URL.");
      }
      if (destination) {
        let url: URL;
        try {
          url = new URL(destination);
        } catch {
          reject("Campaign action destination must be a valid HTTPS URL.");
        }
        if (!usablePublicExternalDestination(url.toString())) {
          reject(
            "Campaign action destination must use a usable public HTTPS URL.",
          );
        }
      }
      return {
        actionType: action.actionType,
        label,
        destination: destination ?? null,
        destinationId,
        sortOrder: action.sortOrder,
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateCampaignDocument(value: unknown): CampaignDocument {
  return validateStoryDocument(value);
}

export function campaignDocumentFromPlainText(value: string): CampaignDocument {
  return storyDocumentFromPlainText(value);
}

export function validateCampaignCandidate(
  value: CampaignCandidate,
): ValidatedCampaignCandidate {
  const title = text(value.title, "Campaign title", 160)!;
  const summary = text(value.summary, "Campaign summary", 320)!;
  const startsAt = instant(value.startsAt, "Campaign start");
  const endsAt = instant(value.endsAt, "Campaign end");
  if (startsAt && endsAt && endsAt < startsAt) {
    reject("Campaign end cannot be before its start.");
  }
  if (
    !CAMPAIGN_TYPES.includes(value.campaignType) ||
    !CAMPAIGN_STATUSES.includes(value.campaignStatus)
  ) {
    reject("Campaign type and status are required.");
  }
  const body = validateCampaignDocument(value.body);
  const goalStatement = text(
    value.goalStatement,
    "Campaign goal statement",
    240,
    false,
  );
  const goalAmountCents = amount(value.goalAmountCents, "Campaign goal");
  const progressAmountCents = amount(
    value.progressAmountCents,
    "Campaign progress",
  );
  const currencyCode =
    text(
      value.currencyCode,
      "Campaign currency code",
      3,
      false,
    )?.toUpperCase() ?? null;
  if (
    (goalAmountCents !== null || progressAmountCents !== null) &&
    currencyCode !== "USD"
  ) {
    reject("Campaign monetary fields currently require USD currency code.");
  }
  if (
    currencyCode !== null &&
    goalAmountCents === null &&
    progressAmountCents === null
  ) {
    reject("Campaign currency code requires a goal or progress amount.");
  }
  return deepFreeze({
    title,
    summary,
    campaignType: value.campaignType,
    campaignStatus: value.campaignStatus,
    startsAt,
    endsAt,
    body,
    goalStatement,
    goalAmountCents,
    progressAmountCents,
    currencyCode,
    facts: validateFacts(value.facts),
    projectIds: validateProjectIds(value.projectIds),
    actions: validateActions(value.actions),
  });
}

export function hashCampaignCandidate(candidate: CampaignCandidate): string {
  const validated = validateCampaignCandidate(candidate);
  return canonicalValueHash({
    kind: "CAMPAIGN",
    title: validated.title,
    summary: validated.summary,
    campaignType: validated.campaignType,
    campaignStatus: validated.campaignStatus,
    startsAt: validated.startsAt?.toISOString() ?? null,
    endsAt: validated.endsAt?.toISOString() ?? null,
    body: validated.body,
    goalStatement: validated.goalStatement,
    goalAmountCents: validated.goalAmountCents,
    progressAmountCents: validated.progressAmountCents,
    currencyCode: validated.currencyCode,
    facts: validated.facts,
    projectIds: validated.projectIds,
    actions: validated.actions,
  });
}

export function isCurrentCampaignStatus(status: CampaignStatus) {
  return (CAMPAIGN_CURRENT_STATUSES as readonly string[]).includes(status);
}

export function isHistoricalCampaignStatus(status: CampaignStatus) {
  return (CAMPAIGN_HISTORICAL_STATUSES as readonly string[]).includes(status);
}
