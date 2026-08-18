import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  approveCampaign,
  campaignDocumentFromPlainText,
  createCampaign,
  getCampaignDraft,
  getPublicCampaignBySlug,
  listCurrentPublicCampaigns,
  listHistoricalPublicCampaigns,
  listPublicCampaigns,
  releaseCampaign,
  saveCampaignRevision,
  sendCampaignForApproval,
  submitCampaign,
  withdrawCampaign,
  type CampaignCandidate,
} from "@/modules/communications/campaigns";
import {
  approveProject,
  createProject,
  projectDocumentFromPlainText,
  releaseProject,
  sendProjectForApproval,
  submitProject,
  withdrawProject,
  type ProjectCandidate,
} from "@/modules/communications/projects";
import type { Capability } from "@/platform/auth/capabilities";
import {
  AuthorizationError,
  ConcurrencyError,
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
      id: `campaign-auth-${suffix}`,
      name: `Campaign ${role.name}`,
      email: `campaign-${suffix}@example.org`,
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

function projectCandidate(
  overrides: Partial<ProjectCandidate> = {},
): ProjectCandidate {
  return {
    title: `Campaign-linked Project ${randomUUID()}`,
    summary: "A fictional public Project used to test Campaign relationships.",
    projectType: "ACCESSIBILITY",
    projectStatus: "PLANNED",
    community: "Schulenburg",
    county: "Fayette County",
    publicArea: "Central Schulenburg",
    startDate: new Date("2027-01-01T00:00:00.000Z"),
    completionDate: null,
    body: projectDocumentFromPlainText("A safe Project description."),
    impactFacts: [],
    ...overrides,
  };
}

function campaignCandidate(
  overrides: Partial<CampaignCandidate> = {},
): CampaignCandidate {
  return {
    title: `Campaign ${randomUUID()}`,
    summary:
      "A public engagement initiative with editorially supplied context.",
    campaignType: "SPECIAL_INITIATIVE",
    campaignStatus: "ACTIVE",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-31T23:59:59.000Z"),
    body: campaignDocumentFromPlainText("A bounded Campaign overview."),
    goalStatement: "An editorially supplied public display goal.",
    goalAmountCents: 10_000_000,
    progressAmountCents: 12_500_000,
    currencyCode: "USD",
    facts: [
      { label: "Focus", value: "Community access", sortOrder: 0 },
      {
        label: "Period",
        value: "November–December",
        unit: "2026",
        sortOrder: 1,
      },
    ],
    projectIds: [],
    ...overrides,
  };
}

async function releasedProject(
  contributor: Actor,
  manager: Actor,
  editor: Actor,
  overrides: Partial<ProjectCandidate> = {},
) {
  const created = await createProject(
    prisma,
    contributor,
    projectCandidate(overrides),
  );
  const submitted = await submitProject(prisma, contributor, {
    projectId: created.projectId,
    expectedVersion: created.version,
    expectedContentHash: created.currentRevision.contentHash,
  });
  const pending = await sendProjectForApproval(prisma, editor, {
    projectId: created.projectId,
    expectedVersion: submitted.version,
    expectedContentHash: submitted.currentRevision.contentHash,
  });
  const approved = await approveProject(prisma, manager, {
    projectId: created.projectId,
    expectedVersion: pending.version,
    expectedContentHash: pending.currentRevision.contentHash,
  });
  const released = await releaseProject(prisma, manager, {
    projectId: created.projectId,
    expectedVersion: approved.version,
    expectedContentHash: approved.currentRevision.contentHash,
    slug: `campaign-project-${randomUUID()}`,
  });
  return { projectId: created.projectId, detail: released };
}

async function releasedCampaign(
  contributor: Actor,
  manager: Actor,
  editor: Actor,
  overrides: Partial<CampaignCandidate> = {},
) {
  const created = await createCampaign(
    prisma,
    contributor,
    campaignCandidate(overrides),
  );
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
    slug: `campaign-${randomUUID()}`,
  });
  return { campaignId: created.campaignId, detail: released };
}

describe("Campaign C1 PostgreSQL domain", () => {
  let contributor: Actor;
  let editor: Actor;
  let manager: Actor;

  beforeAll(async () => {
    contributor = await actor("contributor");
    editor = await actor("editor");
    manager = await actor("communications-manager");
  });

  it("enforces active-admin authorization and own/any responsibility visibility", async () => {
    const created = await createCampaign(
      prisma,
      contributor,
      campaignCandidate(),
    );
    expect(
      (await getCampaignDraft(prisma, contributor, created.campaignId))
        .campaignId,
    ).toBe(created.campaignId);
    expect(
      (await getCampaignDraft(prisma, editor, created.campaignId)).campaignId,
    ).toBe(created.campaignId);
    await expect(
      createCampaign(prisma, editor, campaignCandidate()),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const inactive = await actor("contributor");
    await prisma.adminUser.update({
      where: { id: inactive.adminUserId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expect(
      createCampaign(prisma, inactive, campaignCandidate()),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("persists typed content, bounded facts, integer monetary display facts, and ordered zero/multiple Project links", async () => {
    const first = await releasedProject(contributor, manager, editor);
    const second = await releasedProject(contributor, manager, editor, {
      projectStatus: "IN_PROGRESS",
    });
    const created = await createCampaign(
      prisma,
      contributor,
      campaignCandidate({ projectIds: [second.projectId, first.projectId] }),
    );
    expect(created.currentRevision.campaignType).toBe("SPECIAL_INITIATIVE");
    expect(created.currentRevision.campaignStatus).toBe("ACTIVE");
    expect(
      created.currentRevision.facts.map(({ sortOrder }) => sortOrder),
    ).toEqual([0, 1]);
    expect(created.currentRevision.projectIds).toEqual([
      second.projectId,
      first.projectId,
    ]);
    expect(created.currentRevision.goalAmountCents).toBe(10_000_000);
    expect(created.currentRevision.progressAmountCents).toBe(12_500_000);
    const empty = await createCampaign(
      prisma,
      contributor,
      campaignCandidate({ projectIds: [] }),
    );
    expect(empty.currentRevision.projectIds).toEqual([]);
  });

  it("runs exact-hash review, approval separation, release, immutable snapshot, and safe public projection", async () => {
    const first = await releasedProject(contributor, manager, editor);
    const second = await releasedProject(contributor, manager, editor);
    const created = await createCampaign(
      prisma,
      contributor,
      campaignCandidate({ projectIds: [first.projectId, second.projectId] }),
    );
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
    await expect(
      approveCampaign(prisma, contributor, {
        campaignId: created.campaignId,
        expectedVersion: pending.version,
        expectedContentHash: pending.currentRevision.contentHash,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const approved = await approveCampaign(prisma, manager, {
      campaignId: created.campaignId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const released = await releaseCampaign(prisma, manager, {
      campaignId: created.campaignId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `released-campaign-${randomUUID()}`,
    });
    const projection = await prisma.publicCampaignProjection.findUniqueOrThrow({
      where: { publicationId: released.publicationId },
      include: { facts: true, projectReferences: true },
    });
    const snapshot = await prisma.publicationSnapshot.findUniqueOrThrow({
      where: { id: projection.snapshotId },
    });
    expect(
      projection.projectReferences.map(({ projectId }) => projectId),
    ).toEqual([first.projectId, second.projectId]);
    expect(snapshot.payload).toEqual(
      expect.objectContaining({
        campaignStatus: "ACTIVE",
        goalAmountCents: 10_000_000,
      }),
    );
    expect(snapshot.payload).not.toHaveProperty("ownerId");
    expect(projection).not.toHaveProperty("responsibility");
    expect(projection).not.toHaveProperty("donor");
    const publicCampaign = await getPublicCampaignBySlug(
      prisma,
      released.slug!,
    );
    expect(publicCampaign?.projects.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(
        projection.projectReferences.map(({ slug }) => slug),
      ),
    );
  });

  it("keeps unavailable Project relationships internal and filters later withdrawn Projects from public reads", async () => {
    const privateProject = await createProject(
      prisma,
      contributor,
      projectCandidate(),
    );
    const privateCampaign = await releasedCampaign(
      contributor,
      manager,
      editor,
      { projectIds: [privateProject.projectId] },
    );
    const projection = await prisma.publicCampaignProjection.findUniqueOrThrow({
      where: { publicationId: privateCampaign.detail.publicationId },
      include: { projectReferences: true },
    });
    expect(projection.projectReferences).toEqual([]);
    expect(
      (await getPublicCampaignBySlug(prisma, privateCampaign.detail.slug!))
        ?.projects,
    ).toEqual([]);

    const publicProject = await releasedProject(contributor, manager, editor);
    const publicCampaign = await releasedCampaign(
      contributor,
      manager,
      editor,
      { projectIds: [publicProject.projectId] },
    );
    expect(
      (await getPublicCampaignBySlug(prisma, publicCampaign.detail.slug!))
        ?.projects,
    ).toHaveLength(1);
    await withdrawProject(prisma, manager, {
      projectId: publicProject.projectId,
      expectedVersion: publicProject.detail.version,
      reason: "Campaign relationship regression",
    });
    expect(
      (await getPublicCampaignBySlug(prisma, publicCampaign.detail.slug!))
        ?.projects,
    ).toEqual([]);
  });

  it("keeps planned, active, paused, completed, and cancelled released Campaigns discoverable", async () => {
    for (const campaignStatus of [
      "PLANNED",
      "ACTIVE",
      "PAUSED",
      "COMPLETED",
      "CANCELLED",
    ] as const) {
      await releasedCampaign(contributor, manager, editor, { campaignStatus });
    }
    const all = await listPublicCampaigns(prisma, { limit: 20 });
    expect(new Set(all.map(({ campaignStatus }) => campaignStatus))).toEqual(
      new Set(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
    );
    expect(
      new Set(
        (await listCurrentPublicCampaigns(prisma, { limit: 20 })).map(
          ({ campaignStatus }) => campaignStatus,
        ),
      ),
    ).toEqual(new Set(["PLANNED", "ACTIVE", "PAUSED"]));
    expect(
      new Set(
        (await listHistoricalPublicCampaigns(prisma, { limit: 20 })).map(
          ({ campaignStatus }) => campaignStatus,
        ),
      ),
    ).toEqual(new Set(["COMPLETED", "CANCELLED"]));
  });

  it("keeps successor drafts private, requires current versions/hashes, and updates one stable identity on release", async () => {
    const initial = await releasedCampaign(contributor, manager, editor);
    const successor = await saveCampaignRevision(prisma, contributor, {
      ...campaignCandidate({ title: "Successor Campaign", projectIds: [] }),
      campaignId: initial.campaignId,
      expectedVersion: initial.detail.version,
    });
    expect(await getPublicCampaignBySlug(prisma, initial.detail.slug!)).toEqual(
      expect.objectContaining({ title: initial.detail.currentRevision.title }),
    );
    await expect(
      saveCampaignRevision(prisma, contributor, {
        ...campaignCandidate(),
        campaignId: initial.campaignId,
        expectedVersion: initial.detail.version,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const submitted = await submitCampaign(prisma, contributor, {
      campaignId: initial.campaignId,
      expectedVersion: successor.version,
      expectedContentHash: successor.currentRevision.contentHash,
    });
    const pending = await sendCampaignForApproval(prisma, editor, {
      campaignId: initial.campaignId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveCampaign(prisma, manager, {
      campaignId: initial.campaignId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    await expect(
      releaseCampaign(prisma, manager, {
        campaignId: initial.campaignId,
        expectedVersion: approved.version,
        expectedContentHash: "0".repeat(64),
        slug: `wrong-${randomUUID()}`,
      }),
    ).rejects.toThrow(/candidate changed/i);
    const released = await releaseCampaign(prisma, manager, {
      campaignId: initial.campaignId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `successor-${randomUUID()}`,
    });
    expect(released.campaignId).toBe(initial.campaignId);
    expect(released.snapshotCount).toBe(2);
    expect(
      await getPublicCampaignBySlug(prisma, initial.detail.slug!),
    ).toBeNull();
    expect((await getPublicCampaignBySlug(prisma, released.slug!))?.title).toBe(
      "Successor Campaign",
    );
  });

  it("withdraws public availability, retains audit evidence, and keeps donor/payment/Story/News boundaries isolated", async () => {
    const released = await releasedCampaign(contributor, manager, editor);
    await withdrawCampaign(prisma, manager, {
      campaignId: released.campaignId,
      expectedVersion: released.detail.version,
      reason: "Campaign boundary regression",
    });
    expect(
      await getPublicCampaignBySlug(prisma, released.detail.slug!),
    ).toBeNull();
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        targetType: "Campaign",
        targetId: released.campaignId,
        action: "campaign.withdraw",
      },
    });
    expect(audit.summary).toEqual(
      expect.objectContaining({ publicAvailabilityRemoved: true }),
    );
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: released.detail.publicationId },
      select: { kind: true, campaign: true, newsItem: true, story: true },
    });
    expect(publication.kind).toBe("CAMPAIGN");
    expect(publication.campaign).not.toBeNull();
    expect(publication.newsItem).toBeNull();
    expect(publication.story).toBeNull();
    expect(await prisma.publicCampaignProjection.count()).toBeGreaterThan(0);
  });

  it("keeps Projects independently releasable and withdrawable after Campaign relationships exist", async () => {
    const project = await releasedProject(contributor, manager, editor);
    const campaign = await releasedCampaign(contributor, manager, editor, {
      projectIds: [project.projectId],
    });
    expect(campaign.detail.releaseState).toBe("PUBLISHED");
    const projectRow = await prisma.project.findUniqueOrThrow({
      where: { id: project.projectId },
      include: { publication: true },
    });
    expect(projectRow.publication.releaseState).toBe("PUBLISHED");
    await withdrawProject(prisma, manager, {
      projectId: project.projectId,
      expectedVersion: project.detail.version,
      reason: "Independent Project regression",
    });
    expect(
      (await getPublicCampaignBySlug(prisma, campaign.detail.slug!))?.projects,
    ).toEqual([]);
  });
});
