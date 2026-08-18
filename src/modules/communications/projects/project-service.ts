import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  ProjectStatus,
  ProjectType,
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
  PROJECT_ACTIVE_STATUSES,
  PROJECT_CONTENT_HASH_VERSION,
  hashProjectCandidate,
  type ProjectCandidate,
  type ProjectImpactFactInput,
  validateProjectCandidate,
  validateProjectDocument,
} from "./content";
import {
  nextProjectWorkflowState,
  type ProjectWorkflowAction,
} from "./workflow";

const projectDraftInclude = {
  publication: {
    include: {
      responsibility: true,
      currentRevision: {
        include: { projectRevision: { include: { impactFacts: true } } },
      },
      approvedRevision: {
        include: {
          approval: true,
          projectRevision: { include: { impactFacts: true } },
        },
      },
      snapshots: { select: { id: true }, orderBy: { activatedAt: "desc" } },
    },
  },
} satisfies Prisma.ProjectInclude;

const projectListInclude = {
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
          projectRevision: {
            select: {
              projectType: true,
              projectStatus: true,
              community: true,
              county: true,
              publicArea: true,
              startDate: true,
              completionDate: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRecord = Prisma.ProjectGetPayload<{
  include: typeof projectDraftInclude;
}>;
type ProjectListRecord = Prisma.ProjectGetPayload<{
  include: typeof projectListInclude;
}>;
type Transaction = Prisma.TransactionClient;
type ProjectActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type ProjectAdminDetail = Readonly<{
  projectId: string;
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
    projectType: ProjectType;
    projectStatus: ProjectStatus;
    community: string;
    county: string;
    publicArea: string | null;
    startDate: Date | null;
    completionDate: Date | null;
    body: ReturnType<typeof validateProjectDocument>;
    impactFacts: readonly ProjectImpactFactInput[];
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

export type ProjectAdminListItem = Readonly<{
  projectId: string;
  publicationId: string;
  version: number;
  workflow: PublicationWorkflowState;
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition: "ACTIVE" | "ARCHIVED";
  slug: string | null;
  editorialOwnerAdminUserId: string;
  title: string;
  projectType: ProjectType;
  projectStatus: ProjectStatus;
  community: string;
  county: string;
  updatedAt: Date;
  hasSuccessorDraft: boolean;
}>;

export type PublicProject = Readonly<{
  slug: string;
  title: string;
  summary: string;
  projectType: ProjectType;
  projectStatus: ProjectStatus;
  community: string;
  county: string;
  publicArea: string | null;
  startDate: Date | null;
  completionDate: Date | null;
  body: ReturnType<typeof validateProjectDocument>;
  impactFacts: readonly ProjectImpactFactInput[];
  publishedAt: Date;
}>;

export type ProjectWorkflowInput = Readonly<{
  projectId: string;
  expectedVersion: number;
  expectedContentHash: string;
  reason?: string;
}>;

type ProjectReleaseInput = ProjectWorkflowInput & { slug: string };
type ProjectWithdrawalInput = Readonly<{
  projectId: string;
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
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError("Project version must be a positive integer.");
  }
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

function cap(actor: ProjectActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

async function active(tx: Transaction, adminUserId: string) {
  const user = await tx.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!user) throw new AuthorizationError();
}

function owner(record: ProjectRecord | ProjectListRecord) {
  if (!record.publication.responsibility) {
    throw new PreconditionError(
      "This Project does not have editorial responsibility.",
    );
  }
  return record.publication.responsibility;
}

function currentRevision(record: ProjectRecord) {
  const revision = record.publication.currentRevision;
  if (!revision?.projectRevision) {
    throw new PreconditionError(
      "This Project does not have a complete current revision.",
    );
  }
  return revision as typeof revision & {
    projectRevision: NonNullable<typeof revision.projectRevision>;
  };
}

function readable(
  actor: ProjectActor,
  record: ProjectRecord | ProjectListRecord,
) {
  if (actor.capabilities.includes("projects.read.draft.any")) return;
  if (
    actor.capabilities.includes("projects.read.draft.own") &&
    owner(record).editorialOwnerAdminUserId === actor.adminUserId
  )
    return;
  throw new AuthorizationError();
}

function editable(actor: ProjectActor, record: ProjectRecord) {
  if (actor.capabilities.includes("projects.edit.any")) return;
  if (
    actor.capabilities.includes("projects.edit.own") &&
    owner(record).editorialOwnerAdminUserId === actor.adminUserId
  )
    return;
  throw new AuthorizationError();
}

function assertVersion(record: ProjectRecord, expectedVersion: number) {
  version(expectedVersion);
  if (record.publication.version !== expectedVersion)
    throw new ConcurrencyError();
}

function assertHash(record: ProjectRecord, expectedContentHash: string) {
  if (currentRevision(record).contentHash !== expectedContentHash) {
    throw new PreconditionError(
      "The Project candidate changed. Reload the draft before continuing.",
    );
  }
}

async function find(tx: Transaction, projectId: string) {
  id(projectId, "Project ID");
  const record = await tx.project.findUnique({
    where: { id: projectId },
    include: projectDraftInclude,
  });
  if (!record) throw new NotFoundError("Project draft was not found.");
  return record;
}

async function mutation(
  tx: Transaction,
  projectId: string,
  expectedVersion: number,
) {
  const record = await find(tx, projectId);
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

function detail(record: ProjectRecord): ProjectAdminDetail {
  const revision = currentRevision(record);
  const project = revision.projectRevision;
  const approval = record.publication.approvedRevision?.approval;
  return {
    projectId: record.id,
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
      projectType: project.projectType,
      projectStatus: project.projectStatus,
      community: project.community,
      county: project.county,
      publicArea: project.publicArea,
      startDate: project.startDate,
      completionDate: project.completionDate,
      body: validateProjectDocument(revision.body),
      impactFacts: toFacts(project.impactFacts),
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

function listItem(record: ProjectListRecord): ProjectAdminListItem {
  const revision = record.publication.currentRevision;
  const project = revision?.projectRevision;
  if (!revision || !project)
    throw new PreconditionError(
      "Project list contains an incomplete revision.",
    );
  return {
    projectId: record.id,
    publicationId: record.publicationId,
    version: record.publication.version,
    workflow: record.publication.workflowState,
    releaseState: record.publication.releaseState,
    discoveryDisposition: record.publication.discoveryDisposition,
    slug: record.publication.slug,
    editorialOwnerAdminUserId: owner(record).editorialOwnerAdminUserId,
    title: revision.headline,
    projectType: project.projectType,
    projectStatus: project.projectStatus,
    community: project.community,
    county: project.county,
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
  projectId: string,
  correlationId: string,
  summary: Record<string, string | number | boolean | null>,
) {
  return tx.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId,
      action,
      targetType: "Project",
      targetId: projectId,
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

async function createRevision(
  tx: Transaction,
  publicationId: string,
  actorId: string,
  number: number,
  parentRevisionId: string | null,
  candidate: ProjectCandidate,
) {
  const contentHash = hashProjectCandidate(candidate);
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
      contentHashVersion: PROJECT_CONTENT_HASH_VERSION,
      createdByAdminUserId: actorId,
    },
  });
  await tx.projectRevision.create({
    data: {
      publicationRevisionId: revision.id,
      projectType: candidate.projectType,
      projectStatus: candidate.projectStatus,
      community: candidate.community,
      county: candidate.county,
      publicArea: candidate.publicArea ?? null,
      startDate: candidate.startDate ?? null,
      completionDate: candidate.completionDate ?? null,
      impactFacts: {
        create: candidate.impactFacts.map((fact) => ({ ...fact })),
      },
    },
  });
  return { revision, contentHash };
}

export async function createProject(
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectCandidate & { editorialOwnerAdminUserId?: string },
) {
  cap(actor, "projects.create");
  const candidate = validateProjectCandidate(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const ownerId = input.editorialOwnerAdminUserId ?? actor.adminUserId;
    id(ownerId, "Editorial owner ID");
    if (ownerId !== actor.adminUserId) cap(actor, "projects.edit.any");
    await active(tx, ownerId);
    const publication = await tx.publication.create({
      data: {
        kind: "PROJECT",
        createdById: actor.adminUserId,
        project: { create: {} },
        responsibility: {
          create: {
            editorialOwnerAdminUserId: ownerId,
            changedByAdminUserId: actor.adminUserId,
          },
        },
      },
      include: { project: true },
    });
    if (!publication.project) throw new Error("Project root was not created.");
    const created = await createRevision(
      tx,
      publication.id,
      actor.adminUserId,
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
      "project.create",
      publication.project.id,
      correlationId,
      {
        revisionNumber: 1,
        projectType: candidate.projectType,
        projectStatus: candidate.projectStatus,
      },
    );
    return detail(await find(tx, publication.project.id));
  });
}

export async function getProjectDraft(
  db: PrismaClient,
  actor: ProjectActor,
  projectId: string,
) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await find(tx, projectId);
    readable(actor, record);
    return detail(record);
  });
}

export async function listProjectDrafts(db: PrismaClient, actor: ProjectActor) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    if (
      !actor.capabilities.includes("projects.read.draft.any") &&
      !actor.capabilities.includes("projects.read.draft.own")
    ) {
      throw new AuthorizationError();
    }
    const records = await tx.project.findMany({
      include: projectListInclude,
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

export async function saveProjectRevision(
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectCandidate & { projectId: string; expectedVersion: number },
) {
  const candidate = validateProjectCandidate(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
    editable(actor, record);
    const prior = currentRevision(record);
    const created = await createRevision(
      tx,
      record.publicationId,
      actor.adminUserId,
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
      "project.revision.create",
      record.id,
      correlationId,
      {
        revisionNumber: created.revision.number,
        projectType: candidate.projectType,
        projectStatus: candidate.projectStatus,
        approvalInvalidated: record.publication.approvedRevisionId !== null,
      },
    );
    return detail(await find(tx, record.id));
  });
}

async function workflow(
  db: PrismaClient,
  actor: ProjectActor,
  action: Exclude<ProjectWorkflowAction, "APPROVE">,
  input: ProjectWorkflowInput,
) {
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
    assertHash(record, input.expectedContentHash);
    const current = currentRevision(record);
    if (action === "SUBMIT") {
      cap(actor, "projects.submit_review");
      if (
        owner(record).editorialOwnerAdminUserId !== actor.adminUserId &&
        !actor.capabilities.includes("projects.edit.any")
      ) {
        throw new AuthorizationError();
      }
    } else cap(actor, "projects.review");
    const reason = input.reason?.trim();
    if (action === "REQUEST_CHANGES" && (!reason || reason.length < 3)) {
      throw new ValidationError(
        "Provide a brief reason for requested changes.",
      );
    }
    const next = nextProjectWorkflowState(
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
      `project.${action.toLowerCase()}`,
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

export const submitProject = (
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectWorkflowInput,
) => workflow(db, actor, "SUBMIT", input);
export const requestProjectChanges = (
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectWorkflowInput,
) => workflow(db, actor, "REQUEST_CHANGES", input);
export const sendProjectForApproval = (
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectWorkflowInput,
) => workflow(db, actor, "SEND_FOR_APPROVAL", input);

export async function approveProject(
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectWorkflowInput,
) {
  cap(actor, "projects.approve");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
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
    ) {
      throw new AuthorizationError(
        "A creator, owner, or material editor cannot approve this Project candidate.",
      );
    }
    const next = nextProjectWorkflowState(
      record.publication.workflowState,
      "APPROVE",
    );
    await tx.publicationApproval.create({
      data: {
        publicationId: record.publicationId,
        revisionId: current.id,
        contentHash: current.contentHash,
        contentHashVersion: PROJECT_CONTENT_HASH_VERSION,
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
      "project.approve",
      record.id,
      correlationId,
      {
        revisionNumber: current.number,
        projectStatus: current.projectRevision.projectStatus,
        contentHash: current.contentHash,
        selfApprovalOverride: false,
      },
    );
    return detail(await find(tx, record.id));
  });
}

export async function releaseProject(
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectReleaseInput,
) {
  cap(actor, "projects.release");
  const normalizedSlug = slug(input.slug);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
    assertHash(record, input.expectedContentHash);
    const current = currentRevision(record);
    const project = current.projectRevision;
    const approval = record.publication.approvedRevision?.approval;
    if (
      record.publication.workflowState !== "APPROVED" ||
      !approval ||
      approval.revisionId !== current.id ||
      approval.contentHash !== current.contentHash ||
      record.publication.approvedContentHash !== current.contentHash
    ) {
      throw new PreconditionError(
        "Release requires approval of this exact current Project revision.",
      );
    }
    const facts = toFacts(project.impactFacts);
    const snapshot = await tx.publicationSnapshot.create({
      data: {
        publicationId: record.publicationId,
        sourceRevisionId: current.id,
        sourceContentHash: current.contentHash,
        slug: normalizedSlug,
        payload: {
          title: current.headline,
          summary: current.deck,
          projectType: project.projectType,
          projectStatus: project.projectStatus,
          community: project.community,
          county: project.county,
          publicArea: project.publicArea,
          startDate: project.startDate?.toISOString() ?? null,
          completionDate: project.completionDate?.toISOString() ?? null,
          body: current.body as Prisma.InputJsonValue,
          impactFacts: facts,
        },
      },
    });
    await tx.publicProjectProjection.upsert({
      where: { publicationId: record.publicationId },
      create: {
        publicationId: record.publicationId,
        snapshotId: snapshot.id,
        slug: normalizedSlug,
        title: current.headline,
        summary: current.deck ?? "",
        body: current.body as Prisma.InputJsonValue,
        projectType: project.projectType,
        projectStatus: project.projectStatus,
        community: project.community,
        county: project.county,
        publicArea: project.publicArea,
        startDate: project.startDate,
        completionDate: project.completionDate,
        publishedAt: snapshot.activatedAt,
        impactFacts: { create: facts },
      },
      update: {
        snapshotId: snapshot.id,
        slug: normalizedSlug,
        title: current.headline,
        summary: current.deck ?? "",
        body: current.body as Prisma.InputJsonValue,
        projectType: project.projectType,
        projectStatus: project.projectStatus,
        community: project.community,
        county: project.county,
        publicArea: project.publicArea,
        startDate: project.startDate,
        completionDate: project.completionDate,
        publishedAt: snapshot.activatedAt,
        impactFacts: { deleteMany: {}, create: facts },
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
      "project.release",
      record.id,
      correlationId,
      {
        revisionNumber: current.number,
        projectStatus: project.projectStatus,
        snapshotCreated: true,
      },
    );
    return detail(await find(tx, record.id));
  });
}

export async function withdrawProject(
  db: PrismaClient,
  actor: ProjectActor,
  input: ProjectWithdrawalInput,
) {
  cap(actor, "projects.withdraw");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1_000)
    throw new ValidationError("Provide a brief withdrawal reason.");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
    if (record.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError("Only a released Project can be withdrawn.");
    await tx.publicProjectProjection.delete({
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
      "project.withdraw",
      record.id,
      correlationId,
      { publicAvailabilityRemoved: true },
    );
    return detail(await find(tx, record.id));
  });
}

export async function archiveProject(
  db: PrismaClient,
  actor: ProjectActor,
  input: { projectId: string; expectedVersion: number },
) {
  cap(actor, "projects.archive");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.projectId, input.expectedVersion);
    if (record.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError("Only a released Project can be archived.");
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
      "project.archive",
      record.id,
      correlationId,
      { ordinaryDiscoveryRemoved: true },
    );
    return detail(await find(tx, record.id));
  });
}

function publicProject(row: {
  slug: string;
  title: string;
  summary: string;
  projectType: ProjectType;
  projectStatus: ProjectStatus;
  community: string;
  county: string;
  publicArea: string | null;
  startDate: Date | null;
  completionDate: Date | null;
  publishedAt: Date;
  impactFacts: readonly {
    label: string;
    value: string;
    unit: string | null;
    sortOrder: number;
  }[];
  body: unknown;
}): PublicProject {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    projectType: row.projectType,
    projectStatus: row.projectStatus,
    community: row.community,
    county: row.county,
    publicArea: row.publicArea,
    startDate: row.startDate,
    completionDate: row.completionDate,
    body: validateProjectDocument(row.body),
    impactFacts: toFacts(row.impactFacts),
    publishedAt: row.publishedAt,
  };
}

const publicSelect = {
  slug: true,
  title: true,
  summary: true,
  projectType: true,
  projectStatus: true,
  community: true,
  county: true,
  publicArea: true,
  startDate: true,
  completionDate: true,
  body: true,
  publishedAt: true,
  impactFacts: {
    orderBy: { sortOrder: "asc" as const },
    select: { label: true, value: true, unit: true, sortOrder: true },
  },
} satisfies Prisma.PublicProjectProjectionSelect;

export async function getPublicProjectBySlug(db: PrismaClient, value: string) {
  const row = await db.publicProjectProjection.findFirst({
    where: {
      slug: slug(value),
      publication: {
        releaseState: "PUBLISHED",
        discoveryDisposition: "ACTIVE",
      },
    },
    select: publicSelect,
  });
  return row ? publicProject(row) : null;
}

export async function listPublicProjects(
  db: PrismaClient,
  options: Readonly<{
    projectType?: ProjectType;
    projectStatus?: ProjectStatus;
    limit?: number;
  }> = {},
) {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ValidationError("Project list limit must be between 1 and 100.");
  const where: Prisma.PublicProjectProjectionWhereInput = {
    publication: { releaseState: "PUBLISHED", discoveryDisposition: "ACTIVE" },
  };
  if (options.projectType) where.projectType = options.projectType;
  if (options.projectStatus) where.projectStatus = options.projectStatus;
  const rows = await db.publicProjectProjection.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: publicSelect,
  });
  return rows.map(publicProject);
}

export async function listCurrentPublicProjects(
  db: PrismaClient,
  options: Readonly<{ limit?: number }> = {},
) {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("Project list limit must be between 1 and 100.");
  }
  const rows = await db.publicProjectProjection.findMany({
    where: {
      projectStatus: { in: [...PROJECT_ACTIVE_STATUSES] },
      publication: {
        releaseState: "PUBLISHED",
        discoveryDisposition: "ACTIVE",
      },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: publicSelect,
  });
  return rows.map(publicProject);
}
