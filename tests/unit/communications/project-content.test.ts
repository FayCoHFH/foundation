import { describe, expect, it } from "vitest";

import {
  hashProjectCandidate,
  isActiveProjectStatus,
  projectDocumentFromPlainText,
  validateProjectCandidate,
} from "@/modules/communications/projects/content";
import { ValidationError } from "@/platform/errors/app-error";

const candidate = {
  title: "A new home in Fayette County",
  summary: "A concise public summary of the project.",
  projectType: "NEW_HOME" as const,
  projectStatus: "PLANNED" as const,
  community: "Lexington",
  county: "Fayette County",
  publicArea: "North Lexington",
  startDate: new Date("2026-01-10T00:00:00.000Z"),
  completionDate: new Date("2026-10-10T00:00:00.000Z"),
  body: projectDocumentFromPlainText("A safe public project description."),
  impactFacts: [
    { label: "Homes built", value: "1", unit: "home", sortOrder: 1 },
    { label: "Families served", value: "1", unit: "family", sortOrder: 0 },
  ],
};

describe("Project content contract", () => {
  it("normalizes and deterministically orders bounded impact facts", () => {
    const validated = validateProjectCandidate(candidate);
    expect(validated.impactFacts.map(({ sortOrder }) => sortOrder)).toEqual([
      0, 1,
    ]);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(hashProjectCandidate(candidate)).toBe(
      hashProjectCandidate({
        ...candidate,
        impactFacts: [...candidate.impactFacts].reverse(),
      }),
    );
  });

  it("accepts every code-owned type and independent status", () => {
    for (const projectType of [
      "NEW_HOME",
      "HOME_REPAIR",
      "REHABILITATION",
      "ACCESSIBILITY",
      "COMMUNITY",
      "OTHER",
    ] as const) {
      for (const projectStatus of [
        "PLANNED",
        "IN_PROGRESS",
        "COMPLETED",
        "PAUSED",
        "CANCELLED",
      ] as const) {
        expect(
          validateProjectCandidate({ ...candidate, projectType, projectStatus })
            .projectType,
        ).toBe(projectType);
        expect(isActiveProjectStatus(projectStatus)).toBe(
          ["PLANNED", "IN_PROGRESS", "PAUSED"].includes(projectStatus),
        );
      }
    }
  });

  it("rejects overlong fields, duplicate fact ordering, too many facts, and bad dates", () => {
    expect(() =>
      validateProjectCandidate({ ...candidate, title: "x".repeat(161) }),
    ).toThrow(ValidationError);
    expect(() =>
      validateProjectCandidate({
        ...candidate,
        impactFacts: [
          { label: "One", value: "1", sortOrder: 0 },
          { label: "Two", value: "2", sortOrder: 0 },
        ],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateProjectCandidate({
        ...candidate,
        impactFacts: Array.from({ length: 11 }, (_, sortOrder) => ({
          label: `Fact ${sortOrder}`,
          value: "value",
          sortOrder,
        })),
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateProjectCandidate({
        ...candidate,
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        completionDate: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateProjectCandidate({
        ...candidate,
        projectStatus: "UNKNOWN" as never,
      }),
    ).toThrow(ValidationError);
  });

  it("keeps the public candidate free of operational and identity fields", () => {
    const validated = validateProjectCandidate(candidate);
    expect(validated).not.toHaveProperty("address");
    expect(validated).not.toHaveProperty("latitude");
    expect(validated).not.toHaveProperty("homeowner");
    expect(validated).not.toHaveProperty("applicant");
    expect(validated).not.toHaveProperty("financials");
  });

  it("accepts omitted optional impact fact units through repeated validation", () => {
    const withoutUnit = {
      ...candidate,
      impactFacts: [{ label: "Homes built", value: "1", sortOrder: 0 }],
    };
    expect(validateProjectCandidate(withoutUnit).impactFacts[0]?.unit).toBe(
      null,
    );
    expect(() => hashProjectCandidate(withoutUnit)).not.toThrow();
  });
});
