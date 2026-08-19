import { describe, expect, it } from "vitest";

import {
  LEGACY_PROJECT_HISTORY_RECORDS,
  legacyProjectSlug,
  MIGRATED_PROJECT_HISTORY_RECORDS,
  projectCandidateFromLegacyRecord,
} from "@/modules/content/legacy-project-history";
import { storyDocumentToPlainText } from "@/modules/communications/stories/content";

describe("legacy Project History content seed", () => {
  it("keeps the audited disposition counts explicit", () => {
    expect(LEGACY_PROJECT_HISTORY_RECORDS).toHaveLength(32);
    expect(MIGRATED_PROJECT_HISTORY_RECORDS).toHaveLength(12);
    expect(
      LEGACY_PROJECT_HISTORY_RECORDS.filter(
        (record) => record.disposition === "HISTORICAL_ONLY",
      ),
    ).toHaveLength(19);
    expect(
      LEGACY_PROJECT_HISTORY_RECORDS.filter(
        (record) => record.disposition === "VERIFICATION_REQUIRED",
      ),
    ).toHaveLength(1);
    const dispositions = new Set<string>(
      LEGACY_PROJECT_HISTORY_RECORDS.map((record) => record.disposition),
    );
    expect(dispositions.has("CONFLICT")).toBe(false);
    expect(dispositions.has("REJECTED")).toBe(false);
  });

  it("produces bounded, historical-only Project candidates", () => {
    const slugs = MIGRATED_PROJECT_HISTORY_RECORDS.map(legacyProjectSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
    expect(slugs.every((slug) => slug.length <= 160)).toBe(true);

    for (const record of MIGRATED_PROJECT_HISTORY_RECORDS) {
      const candidate = projectCandidateFromLegacyRecord(record);
      expect(candidate.projectStatus).toBe("COMPLETED");
      expect(candidate.startDate).toBeNull();
      expect(candidate.completionDate).toBeNull();
      expect(candidate.impactFacts).toEqual([]);
      expect(storyDocumentToPlainText(candidate.body)).toContain(
        `${record.month} ${record.year}`,
      );
      expect(candidate.body).not.toHaveProperty("html");
    }
  });

  it("does not turn the participant-specific Wright entry into seedable copy", () => {
    const wright = LEGACY_PROJECT_HISTORY_RECORDS.find(
      (record) => record.id === "PHR-003",
    );
    expect(wright?.disposition).toBe("VERIFICATION_REQUIRED");
    expect(MIGRATED_PROJECT_HISTORY_RECORDS).not.toContain(wright);
  });
});
