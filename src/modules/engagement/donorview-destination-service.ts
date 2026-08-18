import "server-only";

import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

import type {
  DonorViewDestinationPurpose,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import { readServerEnvironment } from "@/platform/config/environment";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";
import {
  DONORVIEW_PURPOSE_LABELS,
  DONORVIEW_PURPOSES,
  DONORVIEW_STATUS_LABELS,
  type DonorViewDestinationAdmin,
  type DonorViewDestinationInput,
  type EngagementConfigurationReadModel,
} from "./donorview-destination-content";
const KNOWN_DONORVIEW_HOSTS = new Set(["app.donorview.com", "app.dvforms.net"]);
const GLOBAL_CONFIGURATION_ID = "GLOBAL";

type DestinationActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;
type Transaction = Prisma.TransactionClient;

function requireCapability(actor: DestinationActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

function assertUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ValidationError(`${label} must be a valid identifier.`);
}

function text(value: string, label: string, max: number, required = true) {
  if (typeof value !== "string")
    throw new ValidationError(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new ValidationError(`Enter a ${label}.`);
  if (normalized.length > max)
    throw new ValidationError(
      `${label} must contain ${max} characters or fewer.`,
    );
  return normalized || null;
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)))
    return false;
  const [first, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIp(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return false;
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function approvedHosts() {
  const configured = readServerEnvironment().donorViewApprovedHosts;
  return new Set([...KNOWN_DONORVIEW_HOSTS, ...configured]);
}

export function validateDonorViewUrl(value: string) {
  const normalized = text(value, "DonorView URL", 2_048)!;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ValidationError("Enter a valid DonorView HTTPS URL.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !hostname ||
    hostname === "localhost" ||
    isPrivateIp(hostname) ||
    !approvedHosts().has(hostname)
  ) {
    throw new ValidationError(
      "Use an approved DonorView HTTPS host without credentials or a URL fragment.",
    );
  }
  return url.toString();
}

function normalizeInput(input: DonorViewDestinationInput) {
  if (!DONORVIEW_PURPOSES.includes(input.purpose))
    throw new ValidationError(
      "Choose a supported DonorView destination purpose.",
    );
  return {
    purpose: input.purpose,
    label: text(input.label, "destination label", 120)!,
    url: validateDonorViewUrl(input.url),
    pageReference: text(
      input.pageReference ?? "",
      "page/reference label",
      160,
      false,
    ),
  };
}

function destinationAdmin(
  row: Prisma.DonorViewDestinationGetPayload<{
    include: {
      verifiedBy: true;
      _count: { select: { campaignActions: true } };
    };
  }>,
  usage: DonorViewDestinationAdmin["usage"],
): DonorViewDestinationAdmin {
  return {
    id: row.id,
    provider: row.provider,
    purpose: row.purpose,
    purposeLabel: DONORVIEW_PURPOSE_LABELS[row.purpose],
    label: row.label,
    url: row.url,
    host: new URL(row.url).hostname,
    pageReference: row.pageReference,
    status: row.status,
    statusLabel: DONORVIEW_STATUS_LABELS[row.status],
    verifiedAt: row.verifiedAt,
    verifiedByAdminUserId: row.verifiedByAdminUserId,
    lastReviewedAt: row.lastReviewedAt,
    version: row.version,
    updatedAt: row.updatedAt,
    usage,
  };
}

async function active(tx: Transaction, adminUserId: string) {
  const user = await tx.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!user) throw new AuthorizationError();
}

function concurrency(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["P2002", "P2025"].includes((error as { code: string }).code)
  );
}

async function run<T>(db: PrismaClient, fn: (tx: Transaction) => Promise<T>) {
  try {
    return await db.$transaction(fn);
  } catch (error) {
    if (concurrency(error)) throw new ConcurrencyError();
    throw error;
  }
}

async function configuration(tx: Transaction) {
  return tx.engagementConfiguration.upsert({
    where: { id: GLOBAL_CONFIGURATION_ID },
    create: { id: GLOBAL_CONFIGURATION_ID },
    update: {},
  });
}

async function assertDestinationPurpose(
  tx: Transaction,
  destinationId: string,
  purpose: DonorViewDestinationPurpose,
  requireVerified = true,
) {
  assertUuid(destinationId, "Destination ID");
  const destination = await tx.donorViewDestination.findUnique({
    where: { id: destinationId },
  });
  if (!destination)
    throw new NotFoundError("DonorView destination was not found.");
  if (destination.purpose !== purpose)
    throw new PreconditionError(
      "This destination cannot be used for that action.",
    );
  if (requireVerified && destination.status !== "VERIFIED")
    throw new PreconditionError(
      "Only an active, verified DonorView destination may be used publicly.",
    );
  return destination;
}

async function writeAudit(
  tx: Transaction,
  actorAdminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  correlationId: string,
  summary: Record<string, string | number | boolean | null>,
) {
  return tx.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId,
      action,
      targetType,
      targetId,
      correlationId,
      summary,
    }),
  });
}

async function usageFor(tx: Transaction, destinationId: string) {
  const [configurationRow, campaignRows] = await Promise.all([
    tx.engagementConfiguration.findUnique({
      where: { id: GLOBAL_CONFIGURATION_ID },
    }),
    tx.campaignAction.findMany({
      where: { destinationId },
      select: {
        actionType: true,
        campaignRevision: {
          select: {
            publicationRevision: {
              select: {
                publication: {
                  select: {
                    id: true,
                    currentRevision: { select: { headline: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  return {
    globalDonate:
      configurationRow?.generalDonateDestinationId === destinationId,
    globalVolunteer:
      configurationRow?.generalVolunteerDestinationId === destinationId,
    campaigns: campaignRows
      .filter(
        (
          row,
        ): row is typeof row & {
          actionType: "DONATE" | "VOLUNTEER";
          campaignRevision: {
            publicationRevision: {
              publication: {
                id: string;
                currentRevision: { headline: string } | null;
              };
            };
          };
        } =>
          (row.actionType === "DONATE" || row.actionType === "VOLUNTEER") &&
          Boolean(
            row.campaignRevision.publicationRevision.publication
              .currentRevision,
          ),
      )
      .map((row) => ({
        campaignId: row.campaignRevision.publicationRevision.publication.id,
        title:
          row.campaignRevision.publicationRevision.publication.currentRevision!
            .headline,
        actionType: row.actionType,
      })),
  } as const;
}

const adminInclude = {
  verifiedBy: true,
  _count: { select: { campaignActions: true } },
} satisfies Prisma.DonorViewDestinationInclude;

export async function listDonorViewDestinations(
  db: PrismaClient,
  actor: DestinationActor,
) {
  requireCapability(actor, "integrations.donorview.read");
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const rows = await tx.donorViewDestination.findMany({
      orderBy: [{ purpose: "asc" }, { updatedAt: "desc" }],
      include: adminInclude,
    });
    return Promise.all(
      rows.map(async (row) =>
        destinationAdmin(row, await usageFor(tx, row.id)),
      ),
    );
  });
}

export async function getEngagementConfiguration(
  db: PrismaClient,
  actor: DestinationActor,
) {
  requireCapability(actor, "integrations.donorview.read");
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const row = await tx.engagementConfiguration.findUnique({
      where: { id: GLOBAL_CONFIGURATION_ID },
    });
    return {
      id: row?.id ?? GLOBAL_CONFIGURATION_ID,
      version: row?.version ?? 1,
      generalDonateDestinationId: row?.generalDonateDestinationId ?? null,
      generalVolunteerDestinationId: row?.generalVolunteerDestinationId ?? null,
    } satisfies EngagementConfigurationReadModel;
  });
}

export async function listCampaignDestinationOptions(
  db: PrismaClient,
  actor: DestinationActor,
) {
  requireCapability(actor, "integrations.donorview.read");
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const rows = await tx.donorViewDestination.findMany({
      where: {
        status: "VERIFIED",
        purpose: { in: ["CAMPAIGN_DONATE", "VOLUNTEER_EVENT"] },
      },
      orderBy: [{ purpose: "asc" }, { label: "asc" }],
      select: {
        id: true,
        purpose: true,
        label: true,
        pageReference: true,
        url: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      label: row.label,
      pageReference: row.pageReference,
      urlHost: new URL(row.url).hostname,
    }));
  });
}

export async function createDonorViewDestination(
  db: PrismaClient,
  actor: DestinationActor,
  input: DonorViewDestinationInput,
) {
  requireCapability(actor, "integrations.donorview.configure");
  const candidate = normalizeInput(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const row = await tx.donorViewDestination.create({
      data: candidate,
      include: adminInclude,
    });
    await writeAudit(
      tx,
      actor.adminUserId,
      "donorview.destination.create",
      "DonorViewDestination",
      row.id,
      correlationId,
      {
        purpose: row.purpose,
        host: new URL(row.url).hostname,
        status: row.status,
      },
    );
    return destinationAdmin(row, await usageFor(tx, row.id));
  });
}

export async function updateDonorViewDestination(
  db: PrismaClient,
  actor: DestinationActor,
  input: DonorViewDestinationInput & { id: string; expectedVersion: number },
) {
  requireCapability(actor, "integrations.donorview.configure");
  assertUuid(input.id, "Destination ID");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new ValidationError("Destination version must be positive.");
  const candidate = normalizeInput(input);
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const existing = await tx.donorViewDestination.findUnique({
      where: { id: input.id },
    });
    if (!existing)
      throw new NotFoundError("DonorView destination was not found.");
    if (existing.version !== input.expectedVersion)
      throw new ConcurrencyError();
    const urlChanged = existing.url !== candidate.url;
    const row = await tx.donorViewDestination.update({
      where: { id: input.id, version: input.expectedVersion },
      data: {
        ...candidate,
        ...(urlChanged
          ? {
              status: "UNVERIFIED",
              verifiedAt: null,
              verifiedByAdminUserId: null,
            }
          : {}),
        version: { increment: 1 },
      },
      include: adminInclude,
    });
    await writeAudit(
      tx,
      actor.adminUserId,
      "donorview.destination.update",
      "DonorViewDestination",
      row.id,
      correlationId,
      { purpose: row.purpose, host: new URL(row.url).hostname, urlChanged },
    );
    return destinationAdmin(row, await usageFor(tx, row.id));
  });
}

export async function verifyDonorViewDestination(
  db: PrismaClient,
  actor: DestinationActor,
  input: { id: string; expectedVersion: number },
) {
  requireCapability(actor, "integrations.donorview.configure");
  assertUuid(input.id, "Destination ID");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const existing = await tx.donorViewDestination.findUnique({
      where: { id: input.id },
    });
    if (!existing)
      throw new NotFoundError("DonorView destination was not found.");
    if (existing.version !== input.expectedVersion)
      throw new ConcurrencyError();
    const row = await tx.donorViewDestination.update({
      where: { id: input.id, version: input.expectedVersion },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedByAdminUserId: actor.adminUserId,
        lastReviewedAt: new Date(),
        version: { increment: 1 },
      },
      include: adminInclude,
    });
    await writeAudit(
      tx,
      actor.adminUserId,
      "donorview.destination.verify",
      "DonorViewDestination",
      row.id,
      correlationId,
      { purpose: row.purpose, host: new URL(row.url).hostname },
    );
    return destinationAdmin(row, await usageFor(tx, row.id));
  });
}

export async function deactivateDonorViewDestination(
  db: PrismaClient,
  actor: DestinationActor,
  input: { id: string; expectedVersion: number },
) {
  requireCapability(actor, "integrations.donorview.configure");
  assertUuid(input.id, "Destination ID");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const existing = await tx.donorViewDestination.findUnique({
      where: { id: input.id },
    });
    if (!existing)
      throw new NotFoundError("DonorView destination was not found.");
    if (existing.version !== input.expectedVersion)
      throw new ConcurrencyError();
    const row = await tx.donorViewDestination.update({
      where: { id: input.id, version: input.expectedVersion },
      data: { status: "INACTIVE", version: { increment: 1 } },
      include: adminInclude,
    });
    await writeAudit(
      tx,
      actor.adminUserId,
      "donorview.destination.deactivate",
      "DonorViewDestination",
      row.id,
      correlationId,
      { purpose: row.purpose, host: new URL(row.url).hostname },
    );
    return destinationAdmin(row, await usageFor(tx, row.id));
  });
}

export async function assignCanonicalDestination(
  db: PrismaClient,
  actor: DestinationActor,
  input: {
    purpose: "GENERAL_DONATE" | "GENERAL_VOLUNTEER";
    destinationId: string | null;
    expectedVersion: number;
  },
) {
  requireCapability(actor, "integrations.donorview.configure");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new ValidationError("Configuration version must be positive.");
  const purpose = input.purpose;
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    if (input.destinationId)
      await assertDestinationPurpose(tx, input.destinationId, purpose);
    const existing = await configuration(tx);
    if (existing.version !== input.expectedVersion)
      throw new ConcurrencyError();
    const row = await tx.engagementConfiguration.update({
      where: { id: GLOBAL_CONFIGURATION_ID, version: input.expectedVersion },
      data: {
        ...(purpose === "GENERAL_DONATE"
          ? { generalDonateDestinationId: input.destinationId }
          : { generalVolunteerDestinationId: input.destinationId }),
        version: { increment: 1 },
      },
    });
    await writeAudit(
      tx,
      actor.adminUserId,
      "donorview.destination.assign-global",
      "EngagementConfiguration",
      GLOBAL_CONFIGURATION_ID,
      correlationId,
      { purpose, destinationAssigned: Boolean(input.destinationId) },
    );
    return {
      id: row.id,
      version: row.version,
      generalDonateDestinationId: row.generalDonateDestinationId,
      generalVolunteerDestinationId: row.generalVolunteerDestinationId,
    } satisfies EngagementConfigurationReadModel;
  });
}

export async function getPublicGlobalDestination(
  db: PrismaClient,
  purpose: "GENERAL_DONATE" | "GENERAL_VOLUNTEER",
) {
  const row = await db.engagementConfiguration.findUnique({
    where: { id: GLOBAL_CONFIGURATION_ID },
    include: {
      generalDonateDestination: true,
      generalVolunteerDestination: true,
    },
  });
  const destination =
    purpose === "GENERAL_DONATE"
      ? row?.generalDonateDestination
      : row?.generalVolunteerDestination;
  return destination?.status === "VERIFIED"
    ? { id: destination.id, url: destination.url }
    : null;
}

export async function getPublicGovernedDestination(
  db: PrismaClient,
  destinationId: string,
  purpose: "CAMPAIGN_DONATE" | "VOLUNTEER_EVENT",
) {
  const destination = await db.donorViewDestination.findUnique({
    where: { id: destinationId },
    select: { id: true, purpose: true, status: true, url: true },
  });
  if (
    !destination ||
    destination.purpose !== purpose ||
    destination.status !== "VERIFIED"
  )
    return null;
  return { id: destination.id, url: destination.url };
}
