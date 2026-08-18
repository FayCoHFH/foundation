import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  assignCanonicalDestination,
  createDonorViewDestination,
  deactivateDonorViewDestination,
  getEngagementConfiguration,
  getPublicGlobalDestination,
  updateDonorViewDestination,
  verifyDonorViewDestination,
} from "@/modules/engagement";
import {
  approveCampaign,
  campaignDocumentFromPlainText,
  createCampaign,
  getPublicCampaignBySlug,
  releaseCampaign,
  sendCampaignForApproval,
  submitCampaign,
} from "@/modules/communications/campaigns";
import type { Capability } from "@/platform/auth/capabilities";
import {
  AuthorizationError,
  ConcurrencyError,
  ValidationError,
} from "@/platform/errors/app-error";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

type Actor = {
  adminUserId: string;
  capabilities: readonly Capability[];
};

async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID();
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `donorview-auth-${suffix}`,
      name: `Destination ${role.name}`,
      email: `destination-${suffix}@example.org`,
      emailVerified: true,
      workspaceDomain: "example.org",
    },
  });
  const admin = await prisma.adminUser.create({
    data: { authUserId: user.id, status: "ACTIVE" },
  });
  await prisma.userRole.create({
    data: { adminUserId: admin.id, roleId: role.id },
  });
  return {
    adminUserId: admin.id,
    capabilities: role.permissions.map(
      ({ permission }) => permission.key as Capability,
    ),
  };
}

describe("DonorView destination PostgreSQL boundary", () => {
  let manager: Actor;
  let editor: Actor;
  let contributor: Actor;

  beforeAll(async () => {
    manager = await actor("communications-manager");
    editor = await actor("editor");
    contributor = await actor("contributor");
  });

  it("requires review before global publication and keeps public resolution current", async () => {
    const created = await createDonorViewDestination(prisma, manager, {
      purpose: "GENERAL_DONATE",
      label: "General giving",
      url: "https://app.dvforms.net/api/dv/general-giving",
      pageReference: "General Giving 2026",
    });
    expect(created.status).toBe("UNVERIFIED");
    expect(
      await getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    ).toBeNull();

    const verified = await verifyDonorViewDestination(prisma, manager, {
      id: created.id,
      expectedVersion: created.version,
    });
    const assigned = await assignCanonicalDestination(prisma, manager, {
      purpose: "GENERAL_DONATE",
      destinationId: verified.id,
      expectedVersion: (await getEngagementConfiguration(prisma, manager))
        .version,
    });
    expect(assigned.generalDonateDestinationId).toBe(created.id);
    expect(await getPublicGlobalDestination(prisma, "GENERAL_DONATE")).toEqual({
      id: created.id,
      url: "https://app.dvforms.net/api/dv/general-giving",
    });

    const replaced = await updateDonorViewDestination(prisma, manager, {
      id: created.id,
      expectedVersion: verified.version,
      purpose: "GENERAL_DONATE",
      label: "General giving replacement",
      url: "https://app.donorview.com/replacement",
      pageReference: "Replacement page",
    });
    expect(replaced.status).toBe("UNVERIFIED");
    expect(
      await getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    ).toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: { targetType: "DonorViewDestination", targetId: created.id },
      select: { action: true, summary: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "donorview.destination.create",
      "donorview.destination.verify",
      "donorview.destination.update",
    ]);
    expect(JSON.stringify(audits)).not.toContain("/replacement");
  });

  it("enforces capability, validation, optimistic concurrency, and safe deactivation", async () => {
    await expect(
      createDonorViewDestination(prisma, editor, {
        purpose: "GENERAL_VOLUNTEER",
        label: "Volunteer",
        url: "https://app.dvforms.net/api/dv/volunteer",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      createDonorViewDestination(prisma, manager, {
        purpose: "GENERAL_VOLUNTEER",
        label: "Volunteer",
        url: "https://example.org/volunteer",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const created = await createDonorViewDestination(prisma, manager, {
      purpose: "GENERAL_VOLUNTEER",
      label: "General volunteer",
      url: "https://app.dvforms.net/api/dv/volunteer",
    });
    await expect(
      verifyDonorViewDestination(prisma, manager, {
        id: created.id,
        expectedVersion: created.version + 1,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const verified = await verifyDonorViewDestination(prisma, manager, {
      id: created.id,
      expectedVersion: created.version,
    });
    const deactivated = await deactivateDonorViewDestination(prisma, manager, {
      id: created.id,
      expectedVersion: verified.version,
    });
    expect(deactivated.status).toBe("INACTIVE");
  });

  it("resolves current Campaign destinations without changing the release", async () => {
    const destination = await createDonorViewDestination(prisma, manager, {
      purpose: "CAMPAIGN_DONATE",
      label: "Campaign giving",
      url: "https://app.dvforms.net/api/dv/campaign-giving",
    });
    const verified = await verifyDonorViewDestination(prisma, manager, {
      id: destination.id,
      expectedVersion: destination.version,
    });
    const created = await createCampaign(prisma, contributor, {
      title: `Governed Campaign ${randomUUID()}`,
      summary: "A Campaign using a reviewed DonorView destination.",
      campaignType: "FUNDRAISING",
      campaignStatus: "ACTIVE",
      body: campaignDocumentFromPlainText("A public Campaign body."),
      facts: [],
      projectIds: [],
      actions: [
        {
          actionType: "DONATE",
          label: "Give through DonorView",
          destinationId: verified.id,
          destination: null,
          sortOrder: 0,
        },
      ],
    });
    const submitted = await submitCampaign(prisma, contributor, {
      campaignId: created.campaignId,
      expectedVersion: created.version,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const pending = await sendCampaignForApproval(prisma, editor, {
      campaignId: created.campaignId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveCampaign(prisma, manager, {
      campaignId: created.campaignId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const released = await releaseCampaign(prisma, manager, {
      campaignId: created.campaignId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `governed-campaign-${randomUUID()}`,
    });
    expect(
      (await getPublicCampaignBySlug(prisma, released.slug!))?.actions[0]
        ?.destination,
    ).toBe("https://app.dvforms.net/api/dv/campaign-giving");

    await deactivateDonorViewDestination(prisma, manager, {
      id: verified.id,
      expectedVersion: verified.version,
    });
    expect(
      (await getPublicCampaignBySlug(prisma, released.slug!))?.actions,
    ).toEqual([]);
  });
});
