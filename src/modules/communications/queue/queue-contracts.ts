import { ValidationError } from "@/platform/errors/app-error";

export const QUEUE_VIEWS = [
  "MY_DRAFTS",
  "NEEDS_REVIEW",
  "NEEDS_APPROVAL",
  "APPROVED_UNRELEASED",
  "RECENTLY_PUBLISHED",
  "EXPIRED_NEWS",
  "ARCHIVED",
  "ALL",
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export const QUEUE_KINDS = ["ALL", "STORY", "NEWS"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const DEFAULT_QUEUE_PAGE_SIZE = 25;
export const MAX_QUEUE_PAGE_SIZE = 100;

export type QueueFilters = Readonly<{
  kind?: QueueKind;
  editorialOwnerAdminUserId?: string;
}>;

export type PublicationQueueRequest = Readonly<{
  view: QueueView;
  filters?: QueueFilters;
  page?: number;
  pageSize?: number;
  now?: Date;
}>;

export type NormalizedPublicationQueueRequest = Readonly<{
  view: QueueView;
  filters: Readonly<{
    kind: QueueKind;
    editorialOwnerAdminUserId?: string;
  }>;
  page: number;
  pageSize: number;
  now: Date;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function enumValue<T extends readonly string[]>(
  value: string,
  values: T,
  label: string,
): T[number] {
  if (!values.includes(value)) {
    throw new ValidationError(`Unsupported ${label}.`);
  }
  return value as T[number];
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
  return value;
}

function normalizedPageSize(value: number | undefined) {
  const pageSize = positiveInteger(
    value ?? DEFAULT_QUEUE_PAGE_SIZE,
    "Queue page size",
  );
  if (pageSize > MAX_QUEUE_PAGE_SIZE) {
    throw new ValidationError(
      `Queue page size cannot exceed ${MAX_QUEUE_PAGE_SIZE}.`,
    );
  }
  return pageSize;
}

export function normalizePublicationQueueRequest(
  input: PublicationQueueRequest,
  defaultNow = new Date(),
): NormalizedPublicationQueueRequest {
  const now = input.now ?? defaultNow;
  if (Number.isNaN(now.valueOf())) {
    throw new ValidationError("Queue evaluation time must be valid.");
  }
  const ownerId = input.filters?.editorialOwnerAdminUserId;
  if (ownerId !== undefined && !UUID_PATTERN.test(ownerId)) {
    throw new ValidationError("Editorial owner must be a valid identifier.");
  }
  return {
    view: enumValue(input.view, QUEUE_VIEWS, "Queue view"),
    filters: {
      kind: enumValue(
        input.filters?.kind ?? "ALL",
        QUEUE_KINDS,
        "Queue publication kind",
      ),
      ...(ownerId ? { editorialOwnerAdminUserId: ownerId } : {}),
    },
    page: positiveInteger(input.page ?? 1, "Queue page"),
    pageSize: normalizedPageSize(input.pageSize),
    now,
  };
}

export function classifyNewsAvailability(
  expiresAt: Date | null,
  at: Date,
): "CURRENT" | "EXPIRED" {
  return expiresAt !== null && expiresAt <= at ? "EXPIRED" : "CURRENT";
}

export type ApprovedCurrentCandidateState = Readonly<{
  workflowState: PublicationQueueItem["workflowState"];
  currentRevisionId: string;
  approvedRevisionId: string | null;
  currentContentHash: string;
  approvedContentHash: string | null;
  activeSnapshotSourceRevisionId: string | null;
}>;

export function isApprovedCurrentCandidateUnreleased(
  state: ApprovedCurrentCandidateState,
) {
  return (
    state.workflowState === "APPROVED" &&
    state.approvedRevisionId === state.currentRevisionId &&
    state.approvedContentHash !== null &&
    state.approvedContentHash === state.currentContentHash &&
    state.activeSnapshotSourceRevisionId !== state.currentRevisionId
  );
}

export function queueDetailPath(kind: "STORY" | "NEWS", typedId: string) {
  return `/admin/communications/${kind === "STORY" ? "stories" : "news"}/${typedId}`;
}

export type PublicationQueueItem = Readonly<{
  publicationId: string;
  publicationKind: "STORY" | "NEWS";
  headline: string;
  workflowState:
    | "DRAFT"
    | "IN_REVIEW"
    | "CHANGES_REQUESTED"
    | "PENDING_APPROVAL"
    | "APPROVED";
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition: "ACTIVE" | "ARCHIVED";
  newsAvailability: "CURRENT" | "EXPIRED" | null;
  editorialOwner: Readonly<{
    adminUserId: string;
    displayName: string;
  }> | null;
  currentRevisionNumber: number;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  archivedAt: Date | null;
  detailPath: string;
  canOpenForApproval: boolean;
  approvalBlockedReasonCode: "SELF_APPROVAL" | null;
}>;

export type PublicationQueueSummary = Readonly<{
  all: number;
  myDrafts: number;
  needsReview: number;
  needsApproval: number;
  approvedUnreleased: number;
  recentlyPublished: number;
  expiredNews: number;
  archived: number;
}>;

export type PublicationQueueResult = Readonly<{
  items: readonly PublicationQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  summary: PublicationQueueSummary;
  evaluatedAt: Date;
}>;
