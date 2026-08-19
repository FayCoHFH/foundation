import { describe, expect, it } from "vitest";

import {
  campaignDocumentFromPlainText,
  hashCampaignCandidate,
  isCurrentCampaignStatus,
  isHistoricalCampaignStatus,
  usablePublicExternalDestination,
  validateCampaignCandidate,
} from "@/modules/communications/campaigns";
import { ValidationError } from "@/platform/errors/app-error";

const projectId = "11111111-1111-4111-8111-111111111111";
const secondProjectId = "22222222-2222-4222-8222-222222222222";

const candidate = {
  title: "Build access together",
  summary: "A public initiative supporting safe, welcoming community work.",
  campaignType: "SPECIAL_INITIATIVE" as const,
  campaignStatus: "PLANNED" as const,
  startsAt: new Date("2026-11-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-31T23:59:59.000Z"),
  body: campaignDocumentFromPlainText("A bounded public campaign overview."),
  goalStatement: "An editorially supplied public goal for this initiative.",
  goalAmountCents: 100_000,
  progressAmountCents: 125_000,
  currencyCode: "usd",
  facts: [
    { label: "Focus", value: "Community access", sortOrder: 1 },
    { label: "Period", value: "November–December", unit: "2026", sortOrder: 0 },
  ],
  projectIds: [projectId, secondProjectId],
};

describe("Campaign content contract", () => {
  it("normalizes ordered facts, currency, and project relationships", () => {
    const validated = validateCampaignCandidate(candidate);
    expect(validated.facts.map(({ sortOrder }) => sortOrder)).toEqual([0, 1]);
    expect(validated.currencyCode).toBe("USD");
    expect(validated.projectIds).toEqual([projectId, secondProjectId]);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(hashCampaignCandidate(candidate)).toBe(
      hashCampaignCandidate({
        ...candidate,
        facts: [...candidate.facts].reverse(),
      }),
    );
  });

  it("keeps factual Campaign status independent from publishing workflow", () => {
    expect(isCurrentCampaignStatus("PLANNED")).toBe(true);
    expect(isCurrentCampaignStatus("ACTIVE")).toBe(true);
    expect(isCurrentCampaignStatus("PAUSED")).toBe(true);
    expect(isHistoricalCampaignStatus("COMPLETED")).toBe(true);
    expect(isHistoricalCampaignStatus("CANCELLED")).toBe(true);
    expect(isCurrentCampaignStatus("COMPLETED")).toBe(false);
  });

  it("rejects invalid bounds, timing, facts, relationships, and money", () => {
    expect(() =>
      validateCampaignCandidate({ ...candidate, title: "x".repeat(161) }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        startsAt: new Date("2026-12-01T00:00:00.000Z"),
        endsAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        facts: [
          { label: "One", value: "1", sortOrder: 0 },
          { label: "Two", value: "2", sortOrder: 0 },
        ],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        projectIds: [projectId, projectId],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({ ...candidate, goalAmountCents: 10.5 }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({ ...candidate, currencyCode: "EUR" }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        facts: Array.from({ length: 11 }, (_, sortOrder) => ({
          label: `Fact ${sortOrder}`,
          value: "value",
          sortOrder,
        })),
      }),
    ).toThrow(ValidationError);
  });

  it("allows zero Projects and progress beyond goal without deriving status", () => {
    const validated = validateCampaignCandidate({
      ...candidate,
      campaignStatus: "COMPLETED",
      projectIds: [],
      progressAmountCents: 200_000,
    });
    expect(validated.projectIds).toEqual([]);
    expect(validated.progressAmountCents).toBe(200_000);
    expect(validated.campaignStatus).toBe("COMPLETED");
  });

  it("validates bounded outbound actions and includes them in the content hash", () => {
    const actions = [
      {
        actionType: "DONATE" as const,
        label: "Give through DonorView",
        destination: "https://giving.example.org/campaigns/community",
        sortOrder: 1,
      },
      {
        actionType: "VOLUNTEER" as const,
        label: "Volunteer",
        destination: "https://volunteer.example.org/register",
        sortOrder: 0,
      },
    ];
    const donateAction = actions[0]!;
    const validated = validateCampaignCandidate({ ...candidate, actions });
    expect(validated.actions.map(({ sortOrder }) => sortOrder)).toEqual([0, 1]);
    expect(validated.actions[0]?.destination).toBe(
      "https://volunteer.example.org/register",
    );
    expect(hashCampaignCandidate({ ...candidate, actions })).not.toBe(
      hashCampaignCandidate(candidate),
    );
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        actions: [
          {
            ...donateAction,
            destination: "javascript:alert(1)",
          },
        ],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        actions: [
          {
            ...donateAction,
            destination: "https://user:secret@example.org/give",
          },
        ],
      }),
    ).toThrow(ValidationError);
    expect(
      usablePublicExternalDestination(
        "https://preview.invalid/campaigns/repair-drive",
      ),
    ).toBeNull();
    expect(usablePublicExternalDestination("https://www.habitat.org/")).toBe(
      "https://www.habitat.org/",
    );
    expect(() =>
      validateCampaignCandidate({
        ...candidate,
        actions: [
          {
            ...donateAction,
            destination: "https://preview.invalid/campaigns/repair-drive",
          },
        ],
      }),
    ).toThrow(ValidationError);
  });
});
