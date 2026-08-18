import type {
  CampaignActionType,
  CampaignStatus,
  CampaignType,
} from "@/generated/prisma/client";

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  FUNDRAISING: "Fundraising",
  MATCHING_GIFT: "Matching gift",
  VOLUNTEER: "Volunteer",
  AWARENESS: "Awareness",
  SPONSORSHIP: "Sponsorship",
  SPECIAL_INITIATIVE: "Special initiative",
  OTHER: "Other",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export const CAMPAIGN_ACTION_LABELS: Record<CampaignActionType, string> = {
  DONATE: "Donate",
  VOLUNTEER: "Volunteer",
  LEARN_MORE: "Learn more",
};

export const CAMPAIGN_TYPES = Object.keys(
  CAMPAIGN_TYPE_LABELS,
) as CampaignType[];
export const CAMPAIGN_STATUSES = Object.keys(
  CAMPAIGN_STATUS_LABELS,
) as CampaignStatus[];
export const CAMPAIGN_ACTION_TYPES = Object.keys(
  CAMPAIGN_ACTION_LABELS,
) as CampaignActionType[];

export function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function formattedCampaignDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export function campaignStatusGroup(status: CampaignStatus) {
  return ["PLANNED", "ACTIVE", "PAUSED"].includes(status)
    ? "CURRENT"
    : "HISTORICAL";
}

export function centsToDollars(value: number | null) {
  return value === null ? "" : (value / 100).toFixed(2);
}

export function formatCampaignAmount(value: number | null, currency = "USD") {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function progressPercent(goal: number | null, progress: number | null) {
  if (goal === null || progress === null || goal <= 0) return null;
  return Math.round((progress / goal) * 100);
}
