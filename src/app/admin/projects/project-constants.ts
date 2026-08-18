import type { ProjectStatus, ProjectType } from "@/generated/prisma/client";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  NEW_HOME: "New Home",
  HOME_REPAIR: "Home Repair",
  REHABILITATION: "Rehabilitation",
  ACCESSIBILITY: "Accessibility",
  COMMUNITY: "Community",
  OTHER: "Other",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];
export const PROJECT_STATUSES = Object.keys(
  PROJECT_STATUS_LABELS,
) as ProjectStatus[];

export function formattedProjectDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function projectStatusGroup(status: ProjectStatus) {
  return ["PLANNED", "IN_PROGRESS", "PAUSED"].includes(status)
    ? "CURRENT"
    : "HISTORICAL";
}
