import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  CampaignActionType,
  CampaignStatus,
  CampaignType,
  DonorViewDestinationPurpose,
  DonorViewDestinationStatus,
  PublicationLifecycleAction,
  PublicationWorkflowState,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

import {
  CAMPAIGN_CONTENT_HASH_VERSION,
  CAMPAIGN_CURRENT_STATUSES,
  CAMPAIGN_HISTORICAL_STATUSES,
  hashCampaignCandidate,
  type CampaignActionInput,
  type CampaignCandidate,
  type CampaignFactInput,
  validateCampaignCandidate,
  validateCampaignDocument,
} from "./content";
import {
  nextStoryWorkflowState,
  type StoryWorkflowAction,
} from "../stories/workflow";

const campaignDraftInclude = {
  publication: {
    include: {
      responsibility: true,
      currentRevision: {
        include: {
          campaignRevision: {
            include: {
              facts: true,
              projects: {
                orderBy: { sortOrder: "asc" },
                select: { projectId: true, sortOrder: true },
              },
              actions: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      approvedRevision: {
        include: {
          approval: true,
          campaignRevision: {
            include: {
              facts: true,
              projects: {
                orderBy: { sortOrder: "asc" },
                select: { projectId: true, sortOrder: true },
              },
              actions: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      snapshots: { select: { id: true }, orderBy: { activatedAt: "desc" } },
    },
  },
} satisfies Prisma.CampaignInclude;

const campaignListInclude = {
  publication: {
    include: {
      responsibility: true,
      currentRevision: {
        select: {
          id: true,
          number: true,
          headline: true,
          contentHash: true,
          createdAt: true,
          campaignRevision: {
            select: {
              campaignType: true,
              campaignStatus: true,
              startsAt: true,
              endsAt: true,
              goalAmountCents: true,
              progressAmountCents: true,
              currencyCode: true,
              projects: { select: { projectId: true } },
              actions: {
                select: {
                  actionType: true,
                  label: true,
                  destination: true,
                  destinationId: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CampaignInclude;

type CampaignRecord = Prisma.CampaignGetPayload<{
  include: typeof campaignDraftInclude;
}>;
type CampaignListRecord = Prisma.CampaignGetPayload<{
  include: typeof campaignListInclude;
}>;
type Transaction = Prisma.TransactionClient;
type CampaignActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type CampaignAdminDetail = Readonly<{
  campaignId: string;
  publicationId: string;
  version: number;
  workflow: PublicationWorkflowState;
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition: "ACTIVE" | "ARCHIVED";
  slug: string | null;
  snapshotCount: number;
  editorialOwnerAdminUserId: string;
  currentRevision: Readonly<{
    id: string;
    number: number;
    title: string;
    summary: string;
    campaignType: CampaignType;
    campaignStatus: CampaignStatus;
    startsAt: Date | null;
    endsAt: Date | null;
    body: ReturnType<typeof validateCampaignDocument>;
    goalStatement: string | null;
    goalAmountCents: number | null;
    progressAmountCents: number | null;
    currencyCode: string | null;
    facts: readonly CampaignFactInput[];
    projectIds: readonly string[];
    actions: readonly CampaignActionInput[];
    contentHash: string;
    createdAt: Date;
  }>;
  approval: Readonly<{
    revisionId: string;
    contentHash: string;
    approvedByAdminUserId: string;
    approvedAt: Date;
  }> | null;
}>;

export type CampaignAdminListItem = Readonly<{
  campaignId: string;
  publicationId: string;
  version: number;
  workflow: PublicationWorkflowState;
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition: "ACTIVE" | "ARCHIVED";
  slug: string | null;
  editorialOwnerAdminUserId: string;
  title: string;
  campaignType: CampaignType;
  campaignStatus: CampaignStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  goalAmountCents: number | null;
  progressAmountCents: number | null;
  currencyCode: string | null;
  linkedProjectCount: number;
  actionCount: number;
  updatedAt: Date;
  hasSuccessorDraft: boolean;
}>;

export type CampaignProjectCandidate = Readonly<{
  projectId: string;
  title: string;
  projectType: string;
  projectStatus: string;
  releaseState: string;
  discoveryDisposition: string;
  publicSlug: string | null;
}>;

export type PublicCampaignProject = Readonly<{
  title: string;
  slug: string;
  sortOrder: number;
}>;

export type PublicCampaignAction = Readonly<{
  actionType: CampaignActionType;
  label: string;
  destination: string;
  sortOrder: number;
  destinationId?: string | null;
}>;

export type PublicCampaign = Readonly<{
  slug: string;
  title: string;
  summary: string;
  campaignType: CampaignType;
  campaignStatus: CampaignStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  body: ReturnType<typeof validateCampaignDocument>;
  goalStatement: string | null;
  goalAmountCents: number | null;
  progressAmountCents: number | null;
  currencyCode: string | null;
  facts: readonly CampaignFactInput[];
  projects: readonly PublicCampaignProject[];
  actions: readonly PublicCampaignAction[];
  publishedAt: Date;
}>;

export type CampaignWorkflowInput = Readonly<{
  campaignId: string;
  expectedVersion: number;
  expectedContentHash: string;
  reason?: string;
}>;

type CampaignReleaseInput = CampaignWorkflowInput & { slug: string };
type CampaignWithdrawalInput = Readonly<{
  campaignId: string;
  expectedVersion: number;
  reason: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function id(value: string, label: string) {
  if (!UUID_PATTERN.test(value))
    throw new ValidationError(`${label} must be a valid identifier.`);
}

function version(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new ValidationError("Campaign version must be a positive integer.");
}

function slug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ||
    normalized.length > 160
  ) {
    throw new ValidationError(
      "Use a canonical URL slug with lowercase letters, numbers, and hyphens.",
    );
  }
  return normalized;
}

function toDbAmount(value: number | null | undefined) {
  return value === null || value === undefined ? null : BigInt(value);
}

function fromDbAmount(value: bigint | number | null) {
  if (value === null) return null;
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(normalized))
    throw new PreconditionError(
      "Campaign monetary value is outside the supported safe range.",
    );
  return normalized;
}

function cap(actor: CampaignActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

async function active(tx: Transaction, adminUserId: string) {
  const user = await tx.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!user) throw new AuthorizationError();
}

function owner(record: CampaignRecord | CampaignListRecord) {
  if (!record.publication.responsibility)
    throw new PreconditionError(
      "This Campaign does not have editorial responsibility.",
    );
  return record.publication.responsibility;
}

function currentRevision(record: CampaignRecord) {
  const revision = record.publication.currentRevision;
  if (!revision?.campaignRevision)
    throw new PreconditionError(
      "This Campaign does not have a complete current revision.",
    );
  return revision as typeof revision & {
    campaignRevision: NonNullable<typeof revision.campaignRevision>;
  };
}

function readable(
  actor: CampaignActor,
  record: CampaignRecord | CampaignListRecord,
) {
  if (actor.capabilities.includes("campaigns.read.draft.any")) return;
  if (
    actor.capabilities.includes("campaigns.read.draft.own") &&
    owner(record).editorialOwnerAdminUserId === actor.adminUserId
  )
    return;
  throw new AuthorizationError();
}

function editable(actor: CampaignActor, record: CampaignRecord) {
  if (actor.capabilities.includes("campaigns.edit.any")) return;
  if (
    actor.capabilities.includes("campaigns.edit.own") &&
    owner(record).editorialOwnerAdminUserId === actor.adminUserId
  )
    return;
  throw new AuthorizationError();
}

function assertVersion(record: CampaignRecord, expectedVersion: number) {
  version(expectedVersion);
  if (record.publication.version !== expectedVersion)
    throw new ConcurrencyError();
}

function assertHash(record: CampaignRecord, expectedContentHash: string) {
  if (currentRevision(record).contentHash !== expectedContentHash) {
    throw new PreconditionError(
      "The Campaign candidate changed. Reload the draft before continuing.",
    );
  }
}

async function find(tx: Transaction, campaignId: string) {
  id(campaignId, "Campaign ID");
  const record = await tx.campaign.findUnique({
    where: { id: campaignId },
    include: campaignDraftInclude,
  });
  if (!record) throw new NotFoundError("Campaign draft was not found.");
  return record;
}

async function mutation(
  tx: Transaction,
  campaignId: string,
  expectedVersion: number,
) {
  const record = await find(tx, campaignId);
  assertVersion(record, expectedVersion);
  return record;
}

function toFacts(
  facts: readonly {
    label: string;
    value: string;
    unit: string | null;
    sortOrder: number;
  }[],
) {
  return facts.map((fact) => ({
    label: fact.label,
    value: fact.value,
    unit: fact.unit,
    sortOrder: fact.sortOrder,
  }));
}

function toActions(
  actions: readonly {
    actionType: CampaignActionType;
    label: string;
    destination: string | null;
    destinationId: string | null;
    sortOrder: number;
  }[],
) {
  return actions.map((action) => ({
    actionType: action.actionType,
    label: action.label,
    destination: action.destination,
    destinationId: action.destinationId,
    sortOrder: action.sortOrder,
  }));
}

function detail(record: CampaignRecord): CampaignAdminDetail {
  const revision = currentRevision(record);
  const campaign = revision.campaignRevision;
  const approval = record.publication.approvedRevision?.approval;
  return {
    campaignId: record.id,
    publicationId: record.publicationId,
    version: record.publication.version,
    workflow: record.publication.workflowState,
    releaseState: record.publication.releaseState,
    discoveryDisposition: record.publication.discoveryDisposition,
    slug: record.publication.slug,
    snapshotCount: record.publication.snapshots.length,
    editorialOwnerAdminUserId: owner(record).editorialOwnerAdminUserId,
    currentRevision: {
      id: revision.id,
      number: revision.number,
      title: revision.headline,
      summary: revision.deck ?? "",
      campaignType: campaign.campaignType,
      campaignStatus: campaign.campaignStatus,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      body: validateCampaignDocument(revision.body),
      goalStatement: campaign.goalStatement,
      goalAmountCents: fromDbAmount(campaign.goalAmountCents),
      progressAmountCents: fromDbAmount(campaign.progressAmountCents),
      currencyCode: campaign.currencyCode,
      facts: toFacts(campaign.facts),
      projectIds: campaign.projects.map(({ projectId }) => projectId),
      actions: toActions(campaign.actions),
      contentHash: revision.contentHash,
      createdAt: revision.createdAt,
    },
    approval: approval
      ? {
          revisionId: approval.revisionId,
          contentHash: approval.contentHash,
          approvedByAdminUserId: approval.approvedByAdminUserId,
          approvedAt: approval.approvedAt,
        }
      : null,
  };
}

function listItem(record: CampaignListRecord): CampaignAdminListItem {
  const revision = record.publication.currentRevision;
  const campaign = revision?.campaignRevision;
  if (!revision || !campaign)
    throw new PreconditionError(
      "Campaign list contains an incomplete revision.",
    );
  return {
    campaignId: record.id,
    publicationId: record.publicationId,
    version: record.publication.version,
    workflow: record.publication.workflowState,
    releaseState: record.publication.releaseState,
    discoveryDisposition: record.publication.discoveryDisposition,
    slug: record.publication.slug,
    editorialOwnerAdminUserId: owner(record).editorialOwnerAdminUserId,
    title: revision.headline,
    campaignType: campaign.campaignType,
    campaignStatus: campaign.campaignStatus,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    goalAmountCents: fromDbAmount(campaign.goalAmountCents),
    progressAmountCents: fromDbAmount(campaign.progressAmountCents),
    currencyCode: campaign.currencyCode,
    linkedProjectCount: campaign.projects.length,
    actionCount: campaign.actions.length,
    updatedAt: record.publication.updatedAt,
    hasSuccessorDraft:
      record.publication.releaseState === "PUBLISHED" &&
      record.publication.workflowState === "DRAFT",
  };
}

function transition(
  tx: Transaction,
  input: {
    publicationId: string;
    action: PublicationLifecycleAction;
    fromState: PublicationWorkflowState | null;
    toState: PublicationWorkflowState | null;
    revisionId: string;
    contentHash: string;
    actorAdminUserId: string;
    correlationId: string;
    reason?: string;
    dimension?:
      "CANDIDATE_WORKFLOW" | "RELEASE_SNAPSHOT" | "DISCOVERY_DISPOSITION";
  },
) {
  return tx.publicationLifecycleTransition.create({
    data: {
      publicationId: input.publicationId,
      dimension: input.dimension ?? "CANDIDATE_WORKFLOW",
      action: input.action,
      fromState: input.fromState,
      toState: input.toState,
      revisionId: input.revisionId,
      contentHash: input.contentHash,
      actorAdminUserId: input.actorAdminUserId,
      reason: input.reason ?? null,
      correlationId: input.correlationId,
    },
  });
}

function audit(
  tx: Transaction,
  actorAdminUserId: string,
  action: string,
  campaignId: string,
  correlationId: string,
  summary: Record<string, string | number | boolean | null>,
) {
  return tx.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId,
      action,
      targetType: "Campaign",
      targetId: campaignId,
      correlationId,
      summary,
    }),
  });
}

function prismaConcurrency(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (["P2002", "P2025"] as unknown[]).includes((error as { code: string }).code)
  );
}

async function updatePublication(
  tx: Transaction,
  publicationId: string,
  expectedVersion: number,
  data: Prisma.PublicationUpdateInput,
) {
  try {
    await tx.publication.update({
      where: { id_version: { id: publicationId, version: expectedVersion } },
      data: { ...data, version: { increment: 1 } },
    });
  } catch (error) {
    if (prismaConcurrency(error)) throw new ConcurrencyError();
    throw error;
  }
}

async function run<T>(db: PrismaClient, fn: (tx: Transaction) => Promise<T>) {
  try {
    return await db.$transaction(fn);
  } catch (error) {
    if (prismaConcurrency(error)) throw new ConcurrencyError();
    throw error;
  }
}

async function assertProjectsExist(
  tx: Transaction,
  projectIds: readonly string[],
  actor: CampaignActor,
) {
  if (projectIds.length === 0) return;
  const projects = await tx.project.findMany({
    where: { id: { in: [...projectIds] } },
    select: {
      id: true,
      publication: {
        select: {
          responsibility: { select: { editorialOwnerAdminUserId: true } },
        },
      },
    },
  });
  if (projects.length !== projectIds.length)
    throw new NotFoundError("One or more linked Projects were not found.");
  if (actor.capabilities.includes("projects.read.draft.any")) return;
  if (!actor.capabilities.includes("projects.read.draft.own"))
    throw new AuthorizationError(
      "Project relationship access is not available to this administrator.",
    );
  if (
    projects.some(
      (project) =>
        project.publication.responsibility?.editorialOwnerAdminUserId !==
        actor.adminUserId,
    )
  )
    throw new AuthorizationError(
      "You may link only Projects you are authorized to read.",
    );
}

async function assertActionDestinations(
  tx: Transaction,
  actions: readonly CampaignActionInput[],
) {
  const governed = actions.filter(
    (action) => action.actionType !== "LEARN_MORE" && action.destinationId,
  );
  if (!governed.length) return;
  const destinations = await tx.donorViewDestination.findMany({
    where: { id: { in: governed.map((action) => action.destinationId!) } },
    select: { id: true, purpose: true, status: true },
  });
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  for (const action of governed) {
    const destination = byId.get(action.destinationId!);
    const expectedPurpose =
      action.actionType === "DONATE" ? "CAMPAIGN_DONATE" : "VOLUNTEER_EVENT";
    if (
      !destination ||
      destination.purpose !== expectedPurpose ||
      destination.status !== "VERIFIED"
    ) {
      throw new PreconditionError(
        "Campaign actions may use only active, verified destinations of the matching purpose.",
      );
    }
  }
}

async function createRevision(
  tx: Transaction,
  publicationId: string,
  actorId: string,
  actor: CampaignActor,
  number: number,
  parentRevisionId: string | null,
  candidate: CampaignCandidate,
) {
  const contentHash = hashCampaignCandidate(candidate);
  await assertProjectsExist(tx, candidate.projectIds ?? [], actor);
  await assertActionDestinations(tx, candidate.actions ?? []);
  const revision = await tx.publicationRevision.create({
    data: {
      publicationId,
      number,
      parentRevisionId,
      headline: candidate.title,
      deck: candidate.summary,
      excerpt: candidate.summary,
      body: candidate.body as Prisma.InputJsonValue,
      schemaVersion: candidate.body.schemaVersion,
      contentHash,
      contentHashVersion: CAMPAIGN_CONTENT_HASH_VERSION,
      createdByAdminUserId: actorId,
    },
  });
  await tx.campaignRevision.create({
    data: {
      publicationRevisionId: revision.id,
      campaignType: candidate.campaignType,
      campaignStatus: candidate.campaignStatus,
      startsAt: candidate.startsAt ?? null,
      endsAt: candidate.endsAt ?? null,
      goalStatement: candidate.goalStatement ?? null,
      goalAmountCents: toDbAmount(candidate.goalAmountCents),
      progressAmountCents: toDbAmount(candidate.progressAmountCents),
      currencyCode: candidate.currencyCode ?? null,
      facts: { create: candidate.facts.map((fact) => ({ ...fact })) },
      projects: {
        create: (candidate.projectIds ?? []).map((projectId, sortOrder) => ({
          projectId,
          sortOrder,
        })),
      },
      actions: {
        create: [...(candidate.actions ?? [])].map((action) => ({
          actionType: action.actionType,
          label: action.label,
          destination: action.destination ?? null,
          destinationId: action.destinationId ?? null,
          sortOrder: action.sortOrder,
        })),
      },
    },
  });
  return { revision, contentHash };
}

export async function createCampaign(
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignCandidate & { editorialOwnerAdminUserId?: string },
) {
  cap(actor, "campaigns.create");
  const candidate = validateCampaignCandidate(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const ownerId = input.editorialOwnerAdminUserId ?? actor.adminUserId;
    id(ownerId, "Editorial owner ID");
    if (ownerId !== actor.adminUserId) cap(actor, "campaigns.edit.any");
    await active(tx, ownerId);
    const publication = await tx.publication.create({
      data: {
        kind: "CAMPAIGN",
        createdById: actor.adminUserId,
        campaign: { create: {} },
        responsibility: {
          create: {
            editorialOwnerAdminUserId: ownerId,
            changedByAdminUserId: actor.adminUserId,
          },
        },
      },
      include: { campaign: true },
    });
    if (!publication.campaign)
      throw new Error("Campaign root was not created.");
    const created = await createRevision(
      tx,
      publication.id,
      actor.adminUserId,
      actor,
      1,
      null,
      candidate,
    );
    await tx.publication.update({
      where: { id: publication.id },
      data: { currentRevisionId: created.revision.id },
    });
    await transition(tx, {
      publicationId: publication.id,
      action: "DRAFT_CREATED",
      fromState: null,
      toState: "DRAFT",
      revisionId: created.revision.id,
      contentHash: created.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.create",
      publication.campaign.id,
      correlationId,
      {
        revisionNumber: 1,
        campaignType: candidate.campaignType,
        campaignStatus: candidate.campaignStatus,
      },
    );
    return detail(await find(tx, publication.campaign.id));
  });
}

export async function getCampaignDraft(
  db: PrismaClient,
  actor: CampaignActor,
  campaignId: string,
) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await find(tx, campaignId);
    readable(actor, record);
    return detail(record);
  });
}

export async function listCampaignDrafts(
  db: PrismaClient,
  actor: CampaignActor,
) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    if (
      !actor.capabilities.includes("campaigns.read.draft.any") &&
      !actor.capabilities.includes("campaigns.read.draft.own")
    )
      throw new AuthorizationError();
    const records = await tx.campaign.findMany({
      include: campaignListInclude,
      orderBy: [{ publication: { updatedAt: "desc" } }, { id: "asc" }],
    });
    return records
      .filter((record) => {
        try {
          readable(actor, record);
          return true;
        } catch {
          return false;
        }
      })
      .map(listItem);
  });
}

export async function listCampaignProjectCandidates(
  db: PrismaClient,
  actor: CampaignActor,
) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    if (
      !actor.capabilities.includes("projects.read.draft.any") &&
      !actor.capabilities.includes("projects.read.draft.own")
    )
      return [];
    const projectWhere: Prisma.ProjectWhereInput = actor.capabilities.includes(
      "projects.read.draft.any",
    )
      ? {}
      : {
          publication: {
            responsibility: {
              editorialOwnerAdminUserId: actor.adminUserId,
            },
          },
        };
    const projectSelect = {
      id: true,
      publication: {
        select: {
          releaseState: true,
          discoveryDisposition: true,
          publicProjectProjection: { select: { slug: true } },
          currentRevision: {
            select: {
              headline: true,
              projectRevision: {
                select: { projectType: true, projectStatus: true },
              },
            },
          },
        },
      },
    } satisfies Prisma.ProjectSelect;
    const records = await tx.project.findMany({
      where: projectWhere,
      select: projectSelect,
      orderBy: { publication: { updatedAt: "desc" } },
    });
    return records.flatMap((record) => {
      const revision = record.publication.currentRevision?.projectRevision;
      const title = record.publication.currentRevision?.headline;
      if (!revision || !title) return [];
      return [
        {
          projectId: record.id,
          title,
          projectType: revision.projectType,
          projectStatus: revision.projectStatus,
          releaseState: record.publication.releaseState,
          discoveryDisposition: record.publication.discoveryDisposition,
          publicSlug: record.publication.publicProjectProjection?.slug ?? null,
        } satisfies CampaignProjectCandidate,
      ];
    });
  });
}

export async function saveCampaignRevision(
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignCandidate & { campaignId: string; expectedVersion: number },
) {
  const candidate = validateCampaignCandidate(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    editable(actor, record);
    const prior = currentRevision(record);
    const created = await createRevision(
      tx,
      record.publicationId,
      actor.adminUserId,
      actor,
      prior.number + 1,
      prior.id,
      candidate,
    );
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      workflowState: "DRAFT",
      approvedContentHash: null,
      currentRevision: { connect: { id: created.revision.id } },
      approvedRevision: { disconnect: true },
    });
    await transition(tx, {
      publicationId: record.publicationId,
      action: "REVISION_CREATED",
      fromState: record.publication.workflowState,
      toState: "DRAFT",
      revisionId: created.revision.id,
      contentHash: created.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.revision.create",
      record.id,
      correlationId,
      {
        revisionNumber: created.revision.number,
        campaignType: candidate.campaignType,
        campaignStatus: candidate.campaignStatus,
        approvalInvalidated: record.publication.approvedRevisionId !== null,
      },
    );
    return detail(await find(tx, record.id));
  });
}

async function workflow(
  db: PrismaClient,
  actor: CampaignActor,
  action: Exclude<StoryWorkflowAction, "APPROVE">,
  input: CampaignWorkflowInput,
) {
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    assertHash(record, input.expectedContentHash);
    const current = currentRevision(record);
    if (action === "SUBMIT") {
      cap(actor, "campaigns.submit_review");
      if (
        owner(record).editorialOwnerAdminUserId !== actor.adminUserId &&
        !actor.capabilities.includes("campaigns.edit.any")
      )
        throw new AuthorizationError();
    } else cap(actor, "campaigns.review");
    const reason = input.reason?.trim();
    if (action === "REQUEST_CHANGES" && (!reason || reason.length < 3))
      throw new ValidationError(
        "Provide a brief reason for requested changes.",
      );
    const next = nextStoryWorkflowState(
      record.publication.workflowState,
      action,
    );
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      workflowState: next,
    });
    await transition(tx, {
      publicationId: record.publicationId,
      action:
        action === "SUBMIT"
          ? "SUBMITTED"
          : action === "REQUEST_CHANGES"
            ? "CHANGES_REQUESTED"
            : "SENT_FOR_APPROVAL",
      fromState: record.publication.workflowState,
      toState: next,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      ...(reason ? { reason } : {}),
    });
    await audit(
      tx,
      actor.adminUserId,
      `campaign.${action.toLowerCase()}`,
      record.id,
      correlationId,
      {
        revisionNumber: current.number,
        fromWorkflow: record.publication.workflowState,
        toWorkflow: next,
      },
    );
    return detail(await find(tx, record.id));
  });
}

export const submitCampaign = (
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignWorkflowInput,
) => workflow(db, actor, "SUBMIT", input);
export const requestCampaignChanges = (
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignWorkflowInput,
) => workflow(db, actor, "REQUEST_CHANGES", input);
export const sendCampaignForApproval = (
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignWorkflowInput,
) => workflow(db, actor, "SEND_FOR_APPROVAL", input);

export async function approveCampaign(
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignWorkflowInput,
) {
  cap(actor, "campaigns.approve");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    assertHash(record, input.expectedContentHash);
    const current = currentRevision(record);
    const contribution = await tx.publicationRevision.findFirst({
      where: {
        publicationId: record.publicationId,
        createdByAdminUserId: actor.adminUserId,
      },
      select: { id: true },
    });
    if (
      contribution ||
      record.publication.createdById === actor.adminUserId ||
      owner(record).editorialOwnerAdminUserId === actor.adminUserId
    )
      throw new AuthorizationError(
        "A creator, owner, or material editor cannot approve this Campaign candidate.",
      );
    const next = nextStoryWorkflowState(
      record.publication.workflowState,
      "APPROVE",
    );
    await tx.publicationApproval.create({
      data: {
        publicationId: record.publicationId,
        revisionId: current.id,
        contentHash: current.contentHash,
        contentHashVersion: CAMPAIGN_CONTENT_HASH_VERSION,
        approvedByAdminUserId: actor.adminUserId,
      },
    });
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      workflowState: next,
      approvedContentHash: current.contentHash,
      approvedRevision: { connect: { id: current.id } },
    });
    await transition(tx, {
      publicationId: record.publicationId,
      action: "APPROVED",
      fromState: record.publication.workflowState,
      toState: next,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.approve",
      record.id,
      correlationId,
      {
        revisionNumber: current.number,
        campaignStatus: current.campaignRevision.campaignStatus,
        contentHash: current.contentHash,
        selfApprovalOverride: false,
      },
    );
    return detail(await find(tx, record.id));
  });
}

async function releaseProjectReferences(tx: Transaction, revisionId: string) {
  const relationships = await tx.campaignProject.findMany({
    where: { campaignRevisionId: revisionId },
    orderBy: { sortOrder: "asc" },
    select: { projectId: true, sortOrder: true },
  });
  const projects = await tx.project.findMany({
    where: { id: { in: relationships.map(({ projectId }) => projectId) } },
    select: {
      id: true,
      publication: {
        select: {
          releaseState: true,
          discoveryDisposition: true,
          publicProjectProjection: { select: { title: true, slug: true } },
        },
      },
    },
  });
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return relationships.flatMap((relationship) => {
    const project = projectById.get(relationship.projectId);
    const projection = project?.publication.publicProjectProjection;
    if (
      !project ||
      !projection ||
      project.publication.releaseState !== "PUBLISHED" ||
      project.publication.discoveryDisposition !== "ACTIVE"
    )
      return [];
    return [
      {
        projectId: relationship.projectId,
        title: projection.title,
        slug: projection.slug,
        sortOrder: relationship.sortOrder,
      },
    ];
  });
}

export async function releaseCampaign(
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignReleaseInput,
) {
  cap(actor, "campaigns.release");
  const normalizedSlug = slug(input.slug);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    assertHash(record, input.expectedContentHash);
    const current = currentRevision(record);
    const campaign = current.campaignRevision;
    const approval = record.publication.approvedRevision?.approval;
    if (
      record.publication.workflowState !== "APPROVED" ||
      !approval ||
      approval.revisionId !== current.id ||
      approval.contentHash !== current.contentHash ||
      record.publication.approvedContentHash !== current.contentHash
    )
      throw new PreconditionError(
        "Release requires approval of this exact current Campaign revision.",
      );
    const facts = toFacts(campaign.facts);
    const actions = toActions(campaign.actions);
    const projectReferences = await releaseProjectReferences(tx, campaign.id);
    const goalAmountCents = fromDbAmount(campaign.goalAmountCents);
    const progressAmountCents = fromDbAmount(campaign.progressAmountCents);
    const snapshot = await tx.publicationSnapshot.create({
      data: {
        publicationId: record.publicationId,
        sourceRevisionId: current.id,
        sourceContentHash: current.contentHash,
        slug: normalizedSlug,
        payload: {
          title: current.headline,
          summary: current.deck,
          campaignType: campaign.campaignType,
          campaignStatus: campaign.campaignStatus,
          startsAt: campaign.startsAt?.toISOString() ?? null,
          endsAt: campaign.endsAt?.toISOString() ?? null,
          body: current.body as Prisma.InputJsonValue,
          goalStatement: campaign.goalStatement,
          goalAmountCents,
          progressAmountCents,
          currencyCode: campaign.currencyCode,
          facts,
          projectReferences,
          actions,
        },
      },
    });
    await tx.publicCampaignProjection.upsert({
      where: { publicationId: record.publicationId },
      create: {
        publicationId: record.publicationId,
        snapshotId: snapshot.id,
        slug: normalizedSlug,
        title: current.headline,
        summary: current.deck ?? "",
        body: current.body as Prisma.InputJsonValue,
        campaignType: campaign.campaignType,
        campaignStatus: campaign.campaignStatus,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        goalStatement: campaign.goalStatement,
        goalAmountCents: toDbAmount(goalAmountCents),
        progressAmountCents: toDbAmount(progressAmountCents),
        currencyCode: campaign.currencyCode,
        publishedAt: snapshot.activatedAt,
        facts: { create: facts },
        projectReferences: { create: projectReferences },
        actions: { create: actions },
      },
      update: {
        snapshotId: snapshot.id,
        slug: normalizedSlug,
        title: current.headline,
        summary: current.deck ?? "",
        body: current.body as Prisma.InputJsonValue,
        campaignType: campaign.campaignType,
        campaignStatus: campaign.campaignStatus,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        goalStatement: campaign.goalStatement,
        goalAmountCents: toDbAmount(goalAmountCents),
        progressAmountCents: toDbAmount(progressAmountCents),
        currencyCode: campaign.currencyCode,
        publishedAt: snapshot.activatedAt,
        facts: { deleteMany: {}, create: facts },
        projectReferences: { deleteMany: {}, create: projectReferences },
        actions: { deleteMany: {}, create: actions },
      },
    });
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      slug: normalizedSlug,
      releaseState: "PUBLISHED",
      discoveryDisposition: "ACTIVE",
      activeSnapshot: { connect: { id: snapshot.id } },
    });
    await transition(tx, {
      publicationId: record.publicationId,
      action: "RELEASED",
      fromState: record.publication.workflowState,
      toState: record.publication.workflowState,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      dimension: "RELEASE_SNAPSHOT",
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.release",
      record.id,
      correlationId,
      {
        revisionNumber: current.number,
        campaignStatus: campaign.campaignStatus,
        snapshotCreated: true,
        publicProjectReferenceCount: projectReferences.length,
      },
    );
    return detail(await find(tx, record.id));
  });
}

export async function withdrawCampaign(
  db: PrismaClient,
  actor: CampaignActor,
  input: CampaignWithdrawalInput,
) {
  cap(actor, "campaigns.withdraw");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1_000)
    throw new ValidationError("Provide a brief withdrawal reason.");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    if (record.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError("Only a released Campaign can be withdrawn.");
    await tx.publicCampaignProjection.delete({
      where: { publicationId: record.publicationId },
    });
    const current = currentRevision(record);
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      releaseState: "WITHDRAWN",
      activeSnapshot: { disconnect: true },
    });
    await transition(tx, {
      publicationId: record.publicationId,
      dimension: "RELEASE_SNAPSHOT",
      action: "WITHDRAWN",
      fromState: record.publication.workflowState,
      toState: record.publication.workflowState,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      reason,
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.withdraw",
      record.id,
      correlationId,
      { publicAvailabilityRemoved: true },
    );
    return detail(await find(tx, record.id));
  });
}

export async function archiveCampaign(
  db: PrismaClient,
  actor: CampaignActor,
  input: { campaignId: string; expectedVersion: number },
) {
  cap(actor, "campaigns.archive");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.campaignId, input.expectedVersion);
    if (record.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError("Only a released Campaign can be archived.");
    const current = currentRevision(record);
    await updatePublication(tx, record.publicationId, input.expectedVersion, {
      discoveryDisposition: "ARCHIVED",
    });
    await transition(tx, {
      publicationId: record.publicationId,
      dimension: "DISCOVERY_DISPOSITION",
      action: "ARCHIVED",
      fromState: record.publication.workflowState,
      toState: record.publication.workflowState,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await audit(
      tx,
      actor.adminUserId,
      "campaign.archive",
      record.id,
      correlationId,
      { ordinaryDiscoveryRemoved: true },
    );
    return detail(await find(tx, record.id));
  });
}

function publicCampaign(row: {
  slug: string;
  title: string;
  summary: string;
  campaignType: CampaignType;
  campaignStatus: CampaignStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  body: unknown;
  goalStatement: string | null;
  goalAmountCents: bigint | number | null;
  progressAmountCents: bigint | number | null;
  currencyCode: string | null;
  publishedAt: Date;
  facts: readonly {
    label: string;
    value: string;
    unit: string | null;
    sortOrder: number;
  }[];
  projectReferences: readonly {
    title: string;
    slug: string;
    sortOrder: number;
  }[];
  actions: readonly {
    actionType: CampaignActionType;
    label: string;
    destination: string | null;
    destinationId: string | null;
    donorViewDestination: {
      purpose: DonorViewDestinationPurpose;
      status: DonorViewDestinationStatus;
      url: string;
    } | null;
    sortOrder: number;
  }[];
}): PublicCampaign {
  const actions = row.actions.flatMap((action) => {
    const expectedPurpose =
      action.actionType === "DONATE" ? "CAMPAIGN_DONATE" : "VOLUNTEER_EVENT";
    const destination = action.destinationId
      ? action.donorViewDestination?.purpose === expectedPurpose &&
        action.donorViewDestination.status === "VERIFIED"
        ? action.donorViewDestination.url
        : null
      : action.destination;
    return destination
      ? [
          {
            actionType: action.actionType,
            label: action.label,
            destination,
            destinationId: action.destinationId,
            sortOrder: action.sortOrder,
          },
        ]
      : [];
  });
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    campaignType: row.campaignType,
    campaignStatus: row.campaignStatus,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    body: validateCampaignDocument(row.body),
    goalStatement: row.goalStatement,
    goalAmountCents: fromDbAmount(row.goalAmountCents),
    progressAmountCents: fromDbAmount(row.progressAmountCents),
    currencyCode: row.currencyCode,
    facts: toFacts(row.facts),
    projects: row.projectReferences,
    actions,
    publishedAt: row.publishedAt,
  };
}

const publicSelect = {
  slug: true,
  title: true,
  summary: true,
  campaignType: true,
  campaignStatus: true,
  startsAt: true,
  endsAt: true,
  body: true,
  goalStatement: true,
  goalAmountCents: true,
  progressAmountCents: true,
  currencyCode: true,
  publishedAt: true,
  facts: {
    orderBy: { sortOrder: "asc" as const },
    select: { label: true, value: true, unit: true, sortOrder: true },
  },
  projectReferences: {
    where: {
      project: {
        publication: {
          releaseState: "PUBLISHED",
          discoveryDisposition: "ACTIVE",
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
    select: { title: true, slug: true, sortOrder: true },
  },
  actions: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      actionType: true,
      label: true,
      destination: true,
      destinationId: true,
      donorViewDestination: {
        select: { purpose: true, status: true, url: true },
      },
      sortOrder: true,
    },
  },
} satisfies Prisma.PublicCampaignProjectionSelect;

const publicWhere: Prisma.PublicCampaignProjectionWhereInput = {
  publication: { releaseState: "PUBLISHED", discoveryDisposition: "ACTIVE" },
};

function listLimit(value: number | undefined) {
  const limit = value ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ValidationError("Campaign list limit must be between 1 and 100.");
  return limit;
}

export async function getPublicCampaignBySlug(db: PrismaClient, value: string) {
  const row = await db.publicCampaignProjection.findFirst({
    where: { ...publicWhere, slug: slug(value) },
    select: publicSelect,
  });
  return row ? publicCampaign(row) : null;
}

export async function listPublicCampaigns(
  db: PrismaClient,
  options: Readonly<{
    campaignType?: CampaignType;
    campaignStatus?: CampaignStatus;
    limit?: number;
  }> = {},
) {
  const limit = listLimit(options.limit);
  const where: Prisma.PublicCampaignProjectionWhereInput = { ...publicWhere };
  if (options.campaignType) where.campaignType = options.campaignType;
  if (options.campaignStatus) where.campaignStatus = options.campaignStatus;
  const rows = await db.publicCampaignProjection.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: publicSelect,
  });
  return rows.map(publicCampaign);
}

export async function listCurrentPublicCampaigns(
  db: PrismaClient,
  options: Readonly<{ limit?: number }> = {},
) {
  const limit = listLimit(options.limit);
  const rows = await db.publicCampaignProjection.findMany({
    where: {
      ...publicWhere,
      campaignStatus: { in: [...CAMPAIGN_CURRENT_STATUSES] },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: publicSelect,
  });
  return rows.map(publicCampaign);
}

export async function listHistoricalPublicCampaigns(
  db: PrismaClient,
  options: Readonly<{ limit?: number }> = {},
) {
  const limit = listLimit(options.limit);
  const rows = await db.publicCampaignProjection.findMany({
    where: {
      ...publicWhere,
      campaignStatus: { in: [...CAMPAIGN_HISTORICAL_STATUSES] },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: publicSelect,
  });
  return rows.map(publicCampaign);
}
