import type { ProjectType } from "@/generated/prisma/client";
import {
  projectDocumentFromPlainText,
  type ProjectCandidate,
} from "@/modules/communications/projects";

export const LEGACY_PROJECT_HISTORY_SOURCE_URL =
  "https://www.fchfh.org/project-history";

export type LegacyProjectHistoryDisposition =
  | "MIGRATE_SELECTED"
  | "HISTORICAL_ONLY"
  | "VERIFICATION_REQUIRED"
  | "CONFLICT"
  | "REJECTED";

export type LegacyProjectHistoryRecord = Readonly<{
  id: string;
  sourceTitle: string;
  projectType: ProjectType;
  month: string;
  year: number;
  community: string;
  publicArea?: string;
  disposition: LegacyProjectHistoryDisposition;
  reason: string;
}>;

/**
 * The legacy page is a dated source record, not a new taxonomy. These entries
 * retain only the safe public facts needed to evaluate a Project destination.
 */
export const LEGACY_PROJECT_HISTORY_RECORDS = [
  {
    id: "PHR-001",
    sourceTitle: "Aging in Place",
    projectType: "ACCESSIBILITY",
    month: "March",
    year: 2026,
    community: "Schulenburg",
    disposition: "MIGRATE_SELECTED",
    reason:
      "Dated historical work record with a safe community-level location.",
  },
  {
    id: "PHR-002",
    sourceTitle: "HammerBuild House",
    projectType: "NEW_HOME",
    month: "February",
    year: 2026,
    community: "Schulenburg",
    publicArea: "Blinn Campus",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated historical new-home record with a public project setting.",
  },
  {
    id: "PHR-003",
    sourceTitle: "Wright Family Home",
    projectType: "NEW_HOME",
    month: "June",
    year: 2025,
    community: "La Grange",
    disposition: "VERIFICATION_REQUIRED",
    reason:
      "Participant-specific source material requires current publication consent and privacy review.",
  },
  {
    id: "PHR-004",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "June",
    year: 2024,
    community: "La Grange",
    publicArea: "Fairgrounds",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated community-level record with a public location.",
  },
  {
    id: "PHR-005",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "February",
    year: 2024,
    community: "Fayette County",
    publicArea: "The Red Door Fund for Mental Health",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Useful historical context, but the source does not establish a clear municipality or work description.",
  },
  {
    id: "PHR-006",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2024,
    community: "Fayette County",
    publicArea: "St. James Episcopal Church",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Useful historical context, but the source does not establish a clear municipality or work description.",
  },
  {
    id: "PHR-007",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2024,
    community: "Hostyn",
    publicArea: "Rest Stop",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-008",
    sourceTitle: "Critical Home Repair",
    projectType: "HOME_REPAIR",
    month: "December",
    year: 2023,
    community: "Schulenburg",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated repair record with a safe community-level location.",
  },
  {
    id: "PHR-009",
    sourceTitle: "Critical Home Repair",
    projectType: "HOME_REPAIR",
    month: "March",
    year: 2023,
    community: "Schulenburg",
    disposition: "HISTORICAL_ONLY",
    reason:
      "A second sparse repair record in the same community is retained for evidence to avoid over-seeding.",
  },
  {
    id: "PHR-010",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2023,
    community: "Hostyn",
    publicArea: "Rest Stop",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-011",
    sourceTitle: "Disaster Response",
    projectType: "OTHER",
    month: "October",
    year: 2022,
    community: "Flatonia",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated response record with a safe community-level location.",
  },
  {
    id: "PHR-012",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "September",
    year: 2022,
    community: "La Grange",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated accessibility record with a safe community-level location.",
  },
  {
    id: "PHR-013",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "September",
    year: 2022,
    community: "La Grange",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate same-month community record is retained in evidence to avoid implying a distinct unverified project.",
  },
  {
    id: "PHR-014",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "September",
    year: 2022,
    community: "Fayetteville",
    disposition: "MIGRATE_SELECTED",
    reason:
      "Dated accessibility record with a distinct community-level location.",
  },
  {
    id: "PHR-015",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "September",
    year: 2022,
    community: "La Grange",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate same-month community record is retained in evidence to avoid implying a distinct unverified project.",
  },
  {
    id: "PHR-016",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "August",
    year: 2022,
    community: "Schulenburg",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-017",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "August",
    year: 2022,
    community: "La Grange",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-018",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "July",
    year: 2022,
    community: "Ledbetter",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated accessibility record with a safe community-level location.",
  },
  {
    id: "PHR-019",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "July",
    year: 2022,
    community: "Flatonia",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-020",
    sourceTitle: "Ramp Install",
    projectType: "ACCESSIBILITY",
    month: "June",
    year: 2022,
    community: "Schulenburg",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-021",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2022,
    community: "Hostyn",
    publicArea: "Rest Stop",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-022",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "August",
    year: 2021,
    community: "La Grange",
    publicArea: "Fairgrounds",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-023",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "April",
    year: 2021,
    community: "La Grange",
    publicArea: "Animal Shelter",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated community-level record with a public location.",
  },
  {
    id: "PHR-024",
    sourceTitle: "Disaster Response",
    projectType: "OTHER",
    month: "March",
    year: 2021,
    community: "La Grange",
    disposition: "HISTORICAL_ONLY",
    reason:
      "A second sparse response record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-025",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2021,
    community: "Hostyn",
    publicArea: "Rest Stop",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-026",
    sourceTitle: "Critical Home Repair",
    projectType: "HOME_REPAIR",
    month: "November",
    year: 2020,
    community: "La Grange",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated repair record with a safe community-level location.",
  },
  {
    id: "PHR-027",
    sourceTitle: "Critical Home Repair",
    projectType: "HOME_REPAIR",
    month: "October",
    year: 2020,
    community: "O'Quinn",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-028",
    sourceTitle: "New Home Build",
    projectType: "NEW_HOME",
    month: "July",
    year: 2020,
    community: "La Grange",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated new-home record with a safe community-level location.",
  },
  {
    id: "PHR-029",
    sourceTitle: "Critical Home Repair",
    projectType: "HOME_REPAIR",
    month: "March",
    year: 2020,
    community: "Flatonia",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse duplicate-type record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-030",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2020,
    community: "Hostyn",
    publicArea: "Rest Stop",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Duplicate community-engagement context is retained in evidence without adding a low-detail public record.",
  },
  {
    id: "PHR-031",
    sourceTitle: "Community Engagement",
    projectType: "COMMUNITY",
    month: "January",
    year: 2020,
    community: "Schulenburg",
    publicArea: "Boys & Girls Club",
    disposition: "HISTORICAL_ONLY",
    reason:
      "Sparse community-engagement record is retained in evidence without over-seeding.",
  },
  {
    id: "PHR-032",
    sourceTitle: "New Home Build",
    projectType: "NEW_HOME",
    month: "August",
    year: 2019,
    community: "La Grange",
    disposition: "MIGRATE_SELECTED",
    reason: "Dated new-home record with a safe community-level location.",
  },
] as const satisfies readonly LegacyProjectHistoryRecord[];

export const MIGRATED_PROJECT_HISTORY_RECORDS =
  LEGACY_PROJECT_HISTORY_RECORDS.filter(
    (record) => record.disposition === "MIGRATE_SELECTED",
  );

export function projectCandidateFromLegacyRecord(
  record: LegacyProjectHistoryRecord,
): ProjectCandidate {
  if (record.disposition !== "MIGRATE_SELECTED") {
    throw new Error(`Legacy record ${record.id} is not approved for seeding.`);
  }
  const location = record.publicArea
    ? `${record.publicArea}, ${record.community}`
    : record.community;
  const dateLabel = `${record.month} ${record.year}`;
  const title = `${record.sourceTitle} — ${record.community} — ${dateLabel}`;
  return {
    title,
    summary: `Historical record of ${record.sourceTitle.toLowerCase()} work in ${location}, ${dateLabel}.`,
    projectType: record.projectType,
    projectStatus: "COMPLETED",
    community: record.community,
    county: "Fayette County",
    publicArea: record.publicArea ?? null,
    startDate: null,
    completionDate: null,
    body: projectDocumentFromPlainText(
      `Fayette County Habitat for Humanity's public project history records ${record.sourceTitle.toLowerCase()} work in ${location} in ${dateLabel}.`,
    ),
    impactFacts: [],
  };
}

export function legacyProjectSlug(record: LegacyProjectHistoryRecord) {
  return `${record.sourceTitle}-${record.community}-${record.month}-${record.year}-${record.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
