import type {
  DiscoveryDisposition,
  NewsAvailability,
  PublicationAggregate,
  PublicationApproval,
  PublicationCommandMeta,
  PublicationRevision,
  PublicationRevisionInput,
  PublicationSchedule,
  PublicationSelfApprovalOverride,
  PublicationSnapshot,
  PublicationTransition,
  RevisionContent,
} from "./contracts";
import { canonicalPublicationHash, canonicalValueHash } from "./hash";

export class PublicationConflictError extends Error {}
export class InvalidPublicationTransitionError extends Error {}
export class StaleApprovalError extends Error {}

function cloneAndDeepFreeze<T>(value: T): T {
  const validate = (candidate: unknown): void => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return;
    }
    if (typeof candidate === "number") {
      if (Number.isFinite(candidate)) return;
      throw new InvalidPublicationTransitionError(
        "Immutable publication state cannot contain non-finite numbers.",
      );
    }
    if (typeof candidate !== "object" || candidate instanceof Date) {
      throw new InvalidPublicationTransitionError(
        "Immutable publication state accepts only JSON primitives, arrays, and plain string-keyed objects; instants must be canonical ISO strings.",
      );
    }
    if (Array.isArray(candidate)) {
      for (const nested of candidate) validate(nested);
      return;
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(candidate).length > 0
    ) {
      throw new InvalidPublicationTransitionError(
        "Immutable publication state accepts only JSON primitives, arrays, and plain string-keyed objects.",
      );
    }
    for (const nested of Object.values(candidate)) validate(nested);
  };
  validate(value);

  const cloned = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(cloned);
  return cloned;
}

function requireExpectedVersion(
  aggregate: PublicationAggregate,
  expectedVersion: number,
): void {
  if (aggregate.version !== expectedVersion) {
    throw new PublicationConflictError(
      `Expected version ${expectedVersion}, received ${aggregate.version}.`,
    );
  }
}

function beginCommand(
  aggregate: PublicationAggregate,
  meta: PublicationCommandMeta,
  operation: string,
  payload: unknown,
): { fingerprint: string; replay: PublicationTransition | null } {
  const idempotencyKey = meta.idempotencyKey.trim();
  if (idempotencyKey.length === 0) {
    throw new InvalidPublicationTransitionError(
      "An idempotency key is required.",
    );
  }
  const fingerprint = canonicalValueHash({ operation, payload });
  const prior = aggregate.processedCommands.find(
    (command) => command.idempotencyKey === idempotencyKey,
  );
  if (prior && prior.fingerprint !== fingerprint) {
    throw new InvalidPublicationTransitionError(
      "An idempotency key cannot be reused for a different publication command.",
    );
  }
  if (prior) {
    return {
      fingerprint,
      replay: { aggregate, outcome: "ALREADY_APPLIED" },
    };
  }
  requireExpectedVersion(aggregate, meta.expectedVersion);
  return { fingerprint, replay: null };
}

function transition(
  aggregate: PublicationAggregate,
  update: Omit<PublicationAggregate, "version" | "processedCommands">,
  meta: PublicationCommandMeta,
  fingerprint: string,
): PublicationTransition {
  return {
    aggregate: cloneAndDeepFreeze({
      ...update,
      version: aggregate.version + 1,
      processedCommands: [
        ...aggregate.processedCommands,
        { idempotencyKey: meta.idempotencyKey.trim(), fingerprint },
      ],
    }),
    outcome: "APPLIED",
  };
}

function canonicalInstant(value: string, label: string): Date {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    throw new InvalidPublicationTransitionError(
      `${label} must be a canonical UTC ISO instant.`,
    );
  }
  return instant;
}

function canonicalCommandInstant(value: Date, label: string): string {
  if (!Number.isFinite(value.getTime())) {
    throw new InvalidPublicationTransitionError(
      `${label} must be a valid UTC instant.`,
    );
  }
  return value.toISOString();
}

function revisionFrom(input: PublicationRevisionInput): PublicationRevision {
  canonicalInstant(input.createdAt, "Revision createdAt");
  if (isNews(input.content) && input.content.expiresAt !== null) {
    canonicalInstant(input.content.expiresAt, "News expiresAt");
  }
  const immutableInput = cloneAndDeepFreeze(input);
  return cloneAndDeepFreeze({
    ...immutableInput,
    contentHash: canonicalPublicationHash(immutableInput),
    hashAlgorithm: "sha256" as const,
    hashVersion: 1 as const,
  });
}

function assertIanaTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new InvalidPublicationTransitionError(
      "Scheduling requires a valid IANA editorial time zone.",
    );
  }
}

function assertRevisionMatches(
  aggregate: PublicationAggregate,
  revisionId: string,
): void {
  if (aggregate.currentRevision.id !== revisionId) {
    throw new StaleApprovalError(
      "The requested revision is not the current candidate.",
    );
  }
}

function assertApprovedHash(
  aggregate: PublicationAggregate,
  revisionId: string,
  hash: string,
): PublicationApproval {
  const approval = aggregate.approval;
  if (
    approval === null ||
    approval.revisionId !== revisionId ||
    approval.contentHash !== hash ||
    aggregate.currentRevision.contentHash !== hash
  ) {
    throw new StaleApprovalError(
      "Publication requires approval of the exact current revision hash.",
    );
  }
  return approval;
}

function isNews(
  content: RevisionContent,
): content is Extract<RevisionContent, { kind: "NEWS" }> {
  return content.kind === "NEWS";
}

export function createPublicationDraft(
  id: string,
  slug: string,
  initialRevision: PublicationRevisionInput,
): PublicationAggregate {
  if (initialRevision.number !== 1) {
    throw new InvalidPublicationTransitionError(
      "The first revision must be number 1.",
    );
  }
  return cloneAndDeepFreeze({
    id,
    kind: initialRevision.content.kind,
    slug,
    version: 1,
    workflow: "DRAFT",
    release: "UNPUBLISHED",
    discovery: "ACTIVE",
    currentRevision: revisionFrom(initialRevision),
    approval: null,
    schedule: null,
    activeSnapshotId: null,
    snapshots: [],
    processedCommands: [],
  });
}

export function submitPublication(
  aggregate: PublicationAggregate,
  meta: PublicationCommandMeta,
): PublicationTransition {
  const command = beginCommand(aggregate, meta, "SUBMIT", {});
  if (command.replay) return command.replay;
  if (
    aggregate.workflow !== "DRAFT" &&
    aggregate.workflow !== "CHANGES_REQUESTED"
  ) {
    throw new InvalidPublicationTransitionError(
      "Only a draft can be submitted.",
    );
  }
  return transition(
    aggregate,
    { ...aggregate, workflow: "IN_REVIEW" },
    meta,
    command.fingerprint,
  );
}

export function moveToPendingApproval(
  aggregate: PublicationAggregate,
  meta: PublicationCommandMeta,
): PublicationTransition {
  const command = beginCommand(aggregate, meta, "MOVE_TO_PENDING_APPROVAL", {});
  if (command.replay) return command.replay;
  if (aggregate.workflow !== "IN_REVIEW") {
    throw new InvalidPublicationTransitionError(
      "Only an in-review candidate can request approval.",
    );
  }
  return transition(
    aggregate,
    { ...aggregate, workflow: "PENDING_APPROVAL" },
    meta,
    command.fingerprint,
  );
}

export function createSuccessorRevision(
  aggregate: PublicationAggregate,
  successor: PublicationRevisionInput,
  meta: PublicationCommandMeta,
): PublicationTransition {
  const command = beginCommand(aggregate, meta, "CREATE_SUCCESSOR_REVISION", {
    revisionHash: canonicalPublicationHash(successor),
  });
  if (command.replay) return command.replay;
  if (successor.content.kind !== aggregate.kind) {
    throw new InvalidPublicationTransitionError(
      "A publication kind cannot change.",
    );
  }
  if (successor.number !== aggregate.currentRevision.number + 1) {
    throw new InvalidPublicationTransitionError(
      "A successor revision number must be contiguous.",
    );
  }
  return transition(
    aggregate,
    {
      ...aggregate,
      currentRevision: revisionFrom(successor),
      workflow: "DRAFT",
      approval: null,
      schedule: null,
    },
    meta,
    command.fingerprint,
  );
}

export function approvePublication(
  aggregate: PublicationAggregate,
  args: {
    readonly revisionId: string;
    readonly approverAdminUserId: string;
    readonly approvedAt: Date;
    readonly requirementKeys: readonly string[];
    readonly selfApprovalOverride?: {
      readonly authorizedBySuperAdminUserId: string;
      readonly reason: string;
    };
    readonly meta: PublicationCommandMeta;
  },
): PublicationTransition {
  const approvedAt = canonicalCommandInstant(args.approvedAt, "Approval time");
  const override = args.selfApprovalOverride
    ? {
        kind: "SUPER_ADMIN_SELF_APPROVAL" as const,
        authorizedBySuperAdminUserId:
          args.selfApprovalOverride.authorizedBySuperAdminUserId.trim(),
        reason: args.selfApprovalOverride.reason.trim(),
      }
    : null;
  const command = beginCommand(aggregate, args.meta, "APPROVE", {
    revisionId: args.revisionId,
    approverAdminUserId: args.approverAdminUserId,
    approvedAt,
    requirementKeys: [...args.requirementKeys].sort(),
    selfApprovalOverride: override,
  });
  if (command.replay) return command.replay;
  if (aggregate.workflow !== "PENDING_APPROVAL") {
    throw new InvalidPublicationTransitionError(
      "Only a pending candidate can be approved.",
    );
  }
  assertRevisionMatches(aggregate, args.revisionId);
  const isSelfApproval =
    aggregate.currentRevision.createdByAdminUserId === args.approverAdminUserId;
  if (isSelfApproval && !override) {
    throw new InvalidPublicationTransitionError(
      "A material author cannot independently approve their own revision.",
    );
  }
  if (
    override &&
    (!isSelfApproval ||
      override.authorizedBySuperAdminUserId !== args.approverAdminUserId ||
      override.authorizedBySuperAdminUserId.length === 0 ||
      override.reason.length < 12)
  ) {
    throw new InvalidPublicationTransitionError(
      "A Super Admin self-approval override must be asserted by the self-approving Super Admin with a reason of at least 12 characters.",
    );
  }

  const selfApprovalOverride: PublicationSelfApprovalOverride | null = override;

  const approval: PublicationApproval = cloneAndDeepFreeze({
    revisionId: aggregate.currentRevision.id,
    contentHash: aggregate.currentRevision.contentHash,
    approvedByAdminUserId: args.approverAdminUserId,
    approvedAt,
    requirementKeys: [...args.requirementKeys],
    selfApprovalOverride,
  });

  return transition(
    aggregate,
    { ...aggregate, workflow: "APPROVED", approval },
    args.meta,
    command.fingerprint,
  );
}

export function schedulePublication(
  aggregate: PublicationAggregate,
  args: {
    readonly revisionId: string;
    readonly contentHash: string;
    readonly activateAt: Date;
    readonly editorialTimeZone: string;
    readonly meta: PublicationCommandMeta;
  },
): PublicationTransition {
  const activateAt = canonicalCommandInstant(
    args.activateAt,
    "Schedule activateAt",
  );
  const command = beginCommand(aggregate, args.meta, "SCHEDULE", {
    revisionId: args.revisionId,
    contentHash: args.contentHash,
    activateAt,
    editorialTimeZone: args.editorialTimeZone,
  });
  if (command.replay) return command.replay;
  assertApprovedHash(aggregate, args.revisionId, args.contentHash);
  assertIanaTimeZone(args.editorialTimeZone);
  if (
    isNews(aggregate.currentRevision.content) &&
    aggregate.currentRevision.content.expiresAt !== null &&
    canonicalInstant(
      aggregate.currentRevision.content.expiresAt,
      "News expiresAt",
    ) <= args.activateAt
  ) {
    throw new InvalidPublicationTransitionError(
      "News must expire after its scheduled activation instant.",
    );
  }

  const schedule: PublicationSchedule = cloneAndDeepFreeze({
    approvedRevisionId: args.revisionId,
    approvedContentHash: args.contentHash,
    activateAt,
    editorialTimeZone: args.editorialTimeZone,
    idempotencyKey: args.meta.idempotencyKey,
  });
  return transition(
    aggregate,
    { ...aggregate, release: "SCHEDULED", schedule },
    args.meta,
    command.fingerprint,
  );
}

export function publishScheduledPublication(
  aggregate: PublicationAggregate,
  args: {
    readonly now: Date;
    readonly snapshotId: string;
    readonly meta: PublicationCommandMeta;
  },
): PublicationTransition {
  const command = beginCommand(aggregate, args.meta, "PUBLISH_SCHEDULED", {
    snapshotId: args.snapshotId,
  });
  if (command.replay) return command.replay;
  const activatedAt = canonicalCommandInstant(args.now, "Activation time");
  const schedule = aggregate.schedule;
  if (schedule === null || aggregate.release !== "SCHEDULED") {
    throw new InvalidPublicationTransitionError(
      "Only a scheduled publication can activate.",
    );
  }
  assertApprovedHash(
    aggregate,
    schedule.approvedRevisionId,
    schedule.approvedContentHash,
  );
  if (args.now < canonicalInstant(schedule.activateAt, "Schedule activateAt")) {
    throw new InvalidPublicationTransitionError(
      "The activation instant has not arrived.",
    );
  }
  if (
    aggregate.discovery === "ARCHIVED" &&
    aggregate.currentRevision.number ===
      aggregate.snapshots.at(-1)?.sourceRevisionNumber
  ) {
    throw new InvalidPublicationTransitionError(
      "An archived publication can only return through an approved successor revision.",
    );
  }

  const publicPayload = {
    content: aggregate.currentRevision.content,
    seo: aggregate.currentRevision.seo,
    authors: aggregate.currentRevision.authors,
    relations: aggregate.currentRevision.relations,
    media: aggregate.currentRevision.media,
  };
  const snapshot: PublicationSnapshot = cloneAndDeepFreeze({
    id: args.snapshotId,
    publicationId: aggregate.id,
    sourceRevisionId: aggregate.currentRevision.id,
    sourceRevisionNumber: aggregate.currentRevision.number,
    approvalHash: schedule.approvedContentHash,
    activatedAt,
    payload: publicPayload,
  });

  return transition(
    aggregate,
    {
      ...aggregate,
      release: "PUBLISHED",
      discovery: "ACTIVE",
      schedule: null,
      activeSnapshotId: snapshot.id,
      snapshots: [...aggregate.snapshots, snapshot],
    },
    args.meta,
    command.fingerprint,
  );
}

export function archivePublication(
  aggregate: PublicationAggregate,
  meta: PublicationCommandMeta,
): PublicationTransition {
  const command = beginCommand(aggregate, meta, "ARCHIVE", {});
  if (command.replay) return command.replay;
  return transition(
    aggregate,
    { ...aggregate, discovery: "ARCHIVED" },
    meta,
    command.fingerprint,
  );
}

export function withdrawPublication(
  aggregate: PublicationAggregate,
  reason: string,
  meta: PublicationCommandMeta,
): PublicationTransition {
  const command = beginCommand(aggregate, meta, "WITHDRAW", {
    reason: reason.trim(),
  });
  if (command.replay) return command.replay;
  if (reason.trim().length === 0) {
    throw new InvalidPublicationTransitionError(
      "Withdrawal requires a reason.",
    );
  }
  return transition(
    aggregate,
    {
      ...aggregate,
      release: "WITHDRAWN",
      activeSnapshotId: null,
      schedule: null,
    },
    meta,
    command.fingerprint,
  );
}

export function newsAvailability(
  aggregate: PublicationAggregate,
  at: Date,
): NewsAvailability | null {
  const activeSnapshot = aggregate.activeSnapshotId
    ? aggregate.snapshots.find(
        (snapshot) => snapshot.id === aggregate.activeSnapshotId,
      )
    : null;
  if (aggregate.activeSnapshotId && !activeSnapshot) {
    throw new InvalidPublicationTransitionError(
      "The active publication snapshot is missing.",
    );
  }
  const content =
    activeSnapshot?.payload.content ?? aggregate.currentRevision.content;
  if (!isNews(content)) {
    return null;
  }
  const expiresAt = content.expiresAt;
  return expiresAt !== null &&
    at >= canonicalInstant(expiresAt, "News expiresAt")
    ? "EXPIRED"
    : "CURRENT";
}

export function isPubliclyEligible(aggregate: PublicationAggregate): boolean {
  return (
    aggregate.release === "PUBLISHED" && aggregate.activeSnapshotId !== null
  );
}

/** Ordinary lists, related-content surfaces, and placements use this narrower
 * predicate. Archived or expired publications retain their canonical page. */
export function isEligibleForOrdinaryDiscovery(
  aggregate: PublicationAggregate,
  at: Date,
): boolean {
  return (
    isPubliclyEligible(aggregate) &&
    aggregate.discovery === "ACTIVE" &&
    newsAvailability(aggregate, at) !== "EXPIRED"
  );
}

export function discoveryDispositionForPublicRead(
  aggregate: PublicationAggregate,
): DiscoveryDisposition {
  return aggregate.discovery;
}
