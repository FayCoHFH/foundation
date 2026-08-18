import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CampaignFields } from "@/app/admin/campaigns/campaign-form";
import { CampaignListUI } from "@/app/admin/campaigns/campaign-list-ui";
import { CampaignDetail } from "@/components/campaigns/campaign-presentation";
import type {
  CampaignAdminListItem,
  PublicCampaign,
} from "@/modules/communications/campaigns";

const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "A public Campaign overview." }],
      },
    ],
  },
} as PublicCampaign["body"];

const campaign: PublicCampaign = {
  slug: "community-build",
  title: "Community Build",
  summary: "A shared effort to make safe homes and welcoming neighborhoods.",
  campaignType: "FUNDRAISING",
  campaignStatus: "ACTIVE",
  startsAt: new Date("2026-04-01T00:00:00Z"),
  endsAt: new Date("2026-12-31T00:00:00Z"),
  body,
  goalStatement: "Support the next phase of community work.",
  goalAmountCents: 25_000_00,
  progressAmountCents: 30_000_00,
  currencyCode: "USD",
  facts: [{ label: "Projects", value: "2", unit: null, sortOrder: 0 }],
  projects: [{ title: "East Side Home", slug: "east-side-home", sortOrder: 0 }],
  actions: [
    {
      actionType: "DONATE",
      label: "Give through DonorView",
      destination: "https://giving.example.org/community-build",
      sortOrder: 0,
    },
  ],
  publishedAt: new Date("2026-04-01T00:00:00Z"),
};

const adminItem: CampaignAdminListItem = {
  campaignId: "11111111-1111-4111-8111-111111111111",
  publicationId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  workflow: "DRAFT",
  releaseState: "UNPUBLISHED",
  discoveryDisposition: "ACTIVE",
  slug: null,
  editorialOwnerAdminUserId: "owner",
  title: "Draft Campaign",
  campaignType: "VOLUNTEER",
  campaignStatus: "PLANNED",
  startsAt: null,
  endsAt: null,
  goalAmountCents: null,
  progressAmountCents: null,
  currencyCode: null,
  linkedProjectCount: 1,
  actionCount: 1,
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  hasSuccessorDraft: false,
};

describe("Campaign UI", () => {
  it("keeps the editor bounded and exposes ordered handoffs", () => {
    const html = renderToStaticMarkup(
      <CampaignFields
        state={{
          status: "idle",
          values: {
            title: "",
            summary: "",
            campaignType: "FUNDRAISING",
            campaignStatus: "PLANNED",
            startsAt: "",
            endsAt: "",
            body: "",
            goalStatement: "",
            goalAmountDollars: "",
            progressAmountDollars: "",
            facts: [
              { label: "Focus", value: "Community", unit: "", sortOrder: 0 },
            ],
            projectIds: ["33333333-3333-4333-8333-333333333333"],
            actions: [
              {
                actionType: "LEARN_MORE",
                label: "Learn more",
                destination: "https://example.org/learn",
                sortOrder: 0,
              },
            ],
          },
        }}
        action={() => undefined}
        pending={false}
        projects={[
          {
            projectId: "33333333-3333-4333-8333-333333333333",
            title: "Community Project",
            projectType: "COMMUNITY",
            projectStatus: "PLANNED",
            releaseState: "PUBLISHED",
            discoveryDisposition: "ACTIVE",
            publicSlug: "community-project",
          },
        ]}
        submitLabel="Create Campaign draft"
      />,
    );
    expect(html).toContain(
      "DonorView remains the authoritative donation system",
    );
    expect(html).toContain("Move fact earlier");
    expect(html).toContain("Move Project earlier");
    expect(html).toContain("Move action earlier");
    expect(html).not.toContain("donor record");
  });

  it("renders body-light admin list information", () => {
    const html = renderToStaticMarkup(
      <CampaignListUI campaigns={[adminItem]} />,
    );
    expect(html).toContain("Draft Campaign");
    expect(html).toContain("Editorial workflow");
    expect(html).not.toContain("contentHash");
  });

  it("renders public actions, progress, and safe linked Project references", () => {
    const html = renderToStaticMarkup(<CampaignDetail campaign={campaign} />);
    expect(html).toContain("Community Build");
    expect(html).toContain("Campaign progress");
    expect(html).toContain("Give through DonorView");
    expect(html).toContain("https://giving.example.org/community-build");
    expect(html).toContain("East Side Home");
    expect(html).not.toContain("editorialOwnerAdminUserId");
    expect(html).not.toContain("donor");
    expect(html).not.toContain("volunteer record");
  });
});
