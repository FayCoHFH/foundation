import { ValidationError } from "@/platform/errors/app-error";

export const DASHBOARD_NEEDS_ATTENTION_PREVIEW_LIMIT = 5;
export const DASHBOARD_MAX_NEEDS_ATTENTION_PREVIEW_LIMIT = 10;
export const DASHBOARD_UPCOMING_HORIZON_DAYS = 14;
export const DASHBOARD_MAX_UPCOMING_HORIZON_DAYS = 90;
export const DASHBOARD_UPCOMING_LIMIT = 20;
export const DASHBOARD_MAX_UPCOMING_LIMIT = 50;
export const DASHBOARD_RECENT_ACTIVITY_LIMIT = 20;
export const DASHBOARD_MAX_RECENT_ACTIVITY_LIMIT = 50;

export type DashboardNeedsAttentionGroupKey =
  "NEEDS_REVIEW" | "NEEDS_APPROVAL" | "APPROVED_UNRELEASED";

export type CommunicationsDashboardRequest = Readonly<{
  evaluationTime?: Date;
  upcomingUntil?: Date;
  needsAttentionPreviewLimit?: number;
  upcomingLimit?: number;
  recentActivityLimit?: number;
}>;

export type NormalizedCommunicationsDashboardRequest = Readonly<{
  evaluationTime: Date;
  upcomingUntil: Date;
  needsAttentionPreviewLimit: number;
  upcomingLimit: number;
  recentActivityLimit: number;
}>;

export type DashboardPublicationItem = Readonly<{
  publicationId: string;
  publicationKind: "STORY" | "NEWS";
  headline: string;
  relevantAt: Date;
  editorialOwner: Readonly<{
    adminUserId: string;
    displayName: string;
  }> | null;
  detailPath: string;
  approvalBlockedReasonCode: "SELF_APPROVAL" | null;
}>;

export type DashboardNeedsAttentionGroup = Readonly<{
  key: DashboardNeedsAttentionGroupKey;
  count: number;
  items: readonly DashboardPublicationItem[];
}>;

export type DashboardNeedsAttentionModule = Readonly<{
  groups: readonly [
    DashboardNeedsAttentionGroup,
    DashboardNeedsAttentionGroup,
    DashboardNeedsAttentionGroup,
  ];
}>;

export type DashboardPlacementEligibility = "ELIGIBLE" | "INELIGIBLE";

export type DashboardPlacementAssignment = Readonly<{
  placementId: string;
  placementKey: PlacementKey;
  publicationId: string;
  targetKind: "STORY" | "NEWS";
  headline: string | null;
  startsAt: Date;
  endsAt: Date | null;
  publicPath: string | null;
  adminPath: string;
  publicEligibility: DashboardPlacementEligibility;
}>;

export type DashboardUpcomingItem =
  | Readonly<{
      kind: "PLACEMENT_ACTIVATION";
      placementId: string;
      placementKey: PlacementKey;
      placementLabel: string;
      startsAt: Date;
      endsAt: Date | null;
      publicationId: string;
      targetKind: "STORY" | "NEWS";
      headline: string | null;
      publicPath: string | null;
      adminPath: string;
      publicEligibility: DashboardPlacementEligibility;
    }>
  | Readonly<{
      kind: "NEWS_EXPIRATION";
      publicationId: string;
      newsId: string;
      headline: string;
      expiresAt: Date;
      publicPath: string;
      adminPath: string;
      publicEligibility: "ELIGIBLE";
    }>;

export type DashboardUpcomingModule = Readonly<{
  evaluationTime: Date;
  upcomingUntil: Date;
  items: readonly DashboardUpcomingItem[];
}>;

export const PLACEMENT_LABELS = {
  HOME_HERO: "Home hero",
  HOME_FEATURED_STORY: "Home featured Story",
  HOME_FEATURED_NEWS: "Home featured News",
  NEWS_FEATURED: "Featured News",
} as const;

export type PlacementKey = keyof typeof PLACEMENT_LABELS;

export type DashboardCurationStatus =
  | "ACTIVE"
  | "EMPTY"
  | "UPCOMING_ONLY"
  | "CONFIGURED_BUT_INEFFECTIVE"
  | "CURRENT_AND_UPCOMING";

export type DashboardCurationSlot = Readonly<{
  placementKey: PlacementKey;
  label: string;
  status: DashboardCurationStatus;
  current: DashboardPlacementAssignment | null;
  upcoming: DashboardPlacementAssignment | null;
}>;

export type DashboardCurrentCurationModule = Readonly<{
  slots: readonly [
    DashboardCurationSlot,
    DashboardCurationSlot,
    DashboardCurationSlot,
    DashboardCurationSlot,
  ];
}>;

export type DashboardActivityKind = "PUBLICATION" | "PLACEMENT";

export type DashboardActivityItem = Readonly<{
  id: string;
  kind: DashboardActivityKind;
  action: string;
  summaryCode: string;
  occurredAt: Date;
  actorDisplayName: string;
  subjectKind: "STORY" | "NEWS" | "PLACEMENT";
  subjectId: string;
  headline: string | null;
  detailPath: string | null;
}>;

export type DashboardRecentActivityModule = Readonly<{
  items: readonly DashboardActivityItem[];
}>;

export type CommunicationsDashboard = Readonly<{
  generatedAt: Date;
  needsAttention: DashboardNeedsAttentionModule | null;
  upcoming: DashboardUpcomingModule | null;
  currentCuration: DashboardCurrentCurationModule | null;
  recentActivity: DashboardRecentActivityModule;
}>;

export type DashboardModuleVisibility = Readonly<{
  needsAttention: boolean;
  upcoming: boolean;
  currentCuration: boolean;
  recentActivity: boolean;
}>;

const positiveInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
  return value;
};

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
) => {
  const normalized = positiveInteger(value ?? fallback, label);
  if (normalized > maximum) {
    throw new ValidationError(`${label} cannot exceed ${maximum}.`);
  }
  return normalized;
};

export function normalizeCommunicationsDashboardRequest(
  input: CommunicationsDashboardRequest = {},
  defaultEvaluationTime = new Date(),
): NormalizedCommunicationsDashboardRequest {
  const evaluationTime = input.evaluationTime ?? defaultEvaluationTime;
  if (Number.isNaN(evaluationTime.valueOf())) {
    throw new ValidationError("Dashboard evaluation time must be valid.");
  }

  const upcomingUntil =
    input.upcomingUntil ??
    new Date(
      evaluationTime.getTime() +
        DASHBOARD_UPCOMING_HORIZON_DAYS * 24 * 60 * 60 * 1_000,
    );
  if (Number.isNaN(upcomingUntil.valueOf())) {
    throw new ValidationError("Dashboard upcoming window must be valid.");
  }
  if (upcomingUntil <= evaluationTime) {
    throw new ValidationError(
      "Dashboard upcoming window must end after evaluation time.",
    );
  }
  const maximumUpcomingUntil = new Date(
    evaluationTime.getTime() +
      DASHBOARD_MAX_UPCOMING_HORIZON_DAYS * 24 * 60 * 60 * 1_000,
  );
  if (upcomingUntil > maximumUpcomingUntil) {
    throw new ValidationError(
      `Dashboard upcoming window cannot exceed ${DASHBOARD_MAX_UPCOMING_HORIZON_DAYS} days.`,
    );
  }

  return {
    evaluationTime,
    upcomingUntil,
    needsAttentionPreviewLimit: boundedInteger(
      input.needsAttentionPreviewLimit,
      DASHBOARD_NEEDS_ATTENTION_PREVIEW_LIMIT,
      DASHBOARD_MAX_NEEDS_ATTENTION_PREVIEW_LIMIT,
      "Dashboard Needs Attention preview limit",
    ),
    upcomingLimit: boundedInteger(
      input.upcomingLimit,
      DASHBOARD_UPCOMING_LIMIT,
      DASHBOARD_MAX_UPCOMING_LIMIT,
      "Dashboard Upcoming limit",
    ),
    recentActivityLimit: boundedInteger(
      input.recentActivityLimit,
      DASHBOARD_RECENT_ACTIVITY_LIMIT,
      DASHBOARD_MAX_RECENT_ACTIVITY_LIMIT,
      "Dashboard Recent Activity limit",
    ),
  };
}

export function deriveCurationStatus(input: {
  hasConfiguredCurrent: boolean;
  currentIsPubliclyEligible: boolean;
  hasUpcoming: boolean;
}): DashboardCurationStatus {
  if (!input.hasConfiguredCurrent && !input.hasUpcoming) return "EMPTY";
  if (!input.hasConfiguredCurrent && input.hasUpcoming) return "UPCOMING_ONLY";
  if (!input.currentIsPubliclyEligible) return "CONFIGURED_BUT_INEFFECTIVE";
  if (input.hasUpcoming) return "CURRENT_AND_UPCOMING";
  return "ACTIVE";
}

export function dashboardModuleVisibility(
  capabilities: readonly string[],
): DashboardModuleVisibility {
  const has = (capability: string) => capabilities.includes(capability);
  const newsPublished = [
    "news.read.draft.any",
    "news.review",
    "news.approve",
    "news.publish",
    "news.withdraw",
    "news.archive",
  ].some(has);
  return {
    needsAttention: has("communications.queue.read"),
    upcoming: has("communications.placements.manage") || newsPublished,
    currentCuration: has("communications.placements.manage"),
    recentActivity: has("communications.dashboard.read"),
  };
}

export function isAllowlistedDashboardActivity(
  action: string,
  targetType: string,
) {
  return ACTIVITY_TARGETS.some(
    (candidate) =>
      candidate.targetType === targetType && candidate.actions.has(action),
  );
}

export const DASHBOARD_ACTIVITY_ACTIONS = [
  "story.create",
  "story.submit",
  "story.review.request_changes",
  "story.review.send_for_approval",
  "story.approve",
  "story.release",
  "story.withdraw",
  "story.archive",
  "story.owner.assign",
  "news.create",
  "news.submit",
  "news.request_changes",
  "news.send_for_approval",
  "news.approve",
  "news.release",
  "news.withdraw",
  "news.archive",
  "placement.assigned",
  "placement.replaced",
  "placement.cleared",
  "placement.cancelled",
] as const;

const ACTIVITY_TARGETS = [
  {
    targetType: "Story",
    actions: new Set<string>(
      DASHBOARD_ACTIVITY_ACTIONS.filter((action) =>
        action.startsWith("story."),
      ),
    ),
  },
  {
    targetType: "NewsItem",
    actions: new Set<string>(
      DASHBOARD_ACTIVITY_ACTIONS.filter((action) => action.startsWith("news.")),
    ),
  },
  {
    targetType: "ContentPlacement",
    actions: new Set<string>(
      DASHBOARD_ACTIVITY_ACTIONS.filter((action) =>
        action.startsWith("placement."),
      ),
    ),
  },
] as const;

export function dashboardActivitySummaryCode(action: string) {
  return action.toUpperCase().replaceAll(".", "_");
}
