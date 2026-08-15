/**
 * Slice 1 publishing contracts. They intentionally describe a narrow shared
 * spine; persistence, rendering, rich-text validation, and UI belong to later
 * slices.
 */

export const publicationKinds = ["STORY", "NEWS"] as const;
export type PublicationKind = (typeof publicationKinds)[number];

export const workflowStates = [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "PENDING_APPROVAL",
  "APPROVED",
] as const;
export type WorkflowState = (typeof workflowStates)[number];

export const releaseStates = [
  "UNPUBLISHED",
  "SCHEDULED",
  "PUBLISHED",
  "WITHDRAWN",
] as const;
export type ReleaseState = (typeof releaseStates)[number];

export type DiscoveryDisposition = "ACTIVE" | "ARCHIVED";
export type NewsAvailability = "CURRENT" | "EXPIRED";

export interface StructuredDocument {
  readonly schemaVersion: number;
  readonly root: Readonly<Record<string, unknown>>;
}

export interface RevisionAuthor {
  readonly authorProfileId: string;
  readonly displayName: string;
  readonly order: number;
}

export interface RevisionMediaUse {
  readonly mediaAssetVersionId: string;
  readonly role: "HERO" | "SOCIAL" | "THUMBNAIL" | "INLINE";
  readonly altText: string | null;
  readonly decorative: boolean;
  readonly caption: string | null;
}

export interface RevisionRelation {
  readonly targetKind:
    | "PROJECT"
    | "PROGRAM"
    | "CAMPAIGN"
    | "EVENT"
    | "GRANT"
    | "PARTNER"
    | "PERSON"
    | "PRODUCT"
    | "STORY"
    | "NEWS";
  readonly targetId: string;
  readonly order: number;
}

export interface SeoMetadata {
  readonly title: string | null;
  readonly description: string | null;
  readonly canonicalPath: string;
}

export interface StoryRevisionContent {
  readonly kind: "STORY";
  readonly headline: string;
  readonly deck: string | null;
  readonly excerpt: string;
  readonly body: StructuredDocument;
  readonly showPublishedDate: boolean;
  readonly showUpdatedDate: boolean;
}

export interface NewsRevisionContent {
  readonly kind: "NEWS";
  readonly headline: string;
  readonly summary: string;
  readonly body: StructuredDocument;
  /** A canonical UTC ISO instant; it is deliberately not a Story field. */
  readonly expiresAt: string | null;
  readonly expirationPresentation: "NO_LONGER_CURRENT" | "ARCHIVE_NOTICE";
}

export type RevisionContent = StoryRevisionContent | NewsRevisionContent;

export interface PublicationRevisionInput {
  readonly id: string;
  readonly number: number;
  readonly createdByAdminUserId: string;
  /** Canonical UTC ISO instant. Immutable state never exposes mutable Date objects. */
  readonly createdAt: string;
  readonly content: RevisionContent;
  readonly seo: SeoMetadata;
  readonly authors: readonly RevisionAuthor[];
  readonly relations: readonly RevisionRelation[];
  readonly media: readonly RevisionMediaUse[];
}

export interface PublicationRevision extends PublicationRevisionInput {
  readonly contentHash: string;
  readonly hashAlgorithm: "sha256";
  readonly hashVersion: 1;
}

export interface PublicationApproval {
  readonly revisionId: string;
  readonly contentHash: string;
  readonly approvedByAdminUserId: string;
  readonly approvedAt: string;
  readonly requirementKeys: readonly string[];
  readonly selfApprovalOverride: PublicationSelfApprovalOverride | null;
}

/**
 * Explicit evidence that the trusted application service authorized the rare
 * Super Admin self-approval exception. Persistence must audit this actor and
 * reason alongside the immutable approval record.
 */
export interface PublicationSelfApprovalOverride {
  readonly kind: "SUPER_ADMIN_SELF_APPROVAL";
  readonly authorizedBySuperAdminUserId: string;
  readonly reason: string;
}

/**
 * The instant and IANA presentation zone are kept together. The instant is
 * authoritative; the zone communicates editorial intent and supports DST-safe
 * display/validation without storing an ambiguous local time.
 */
export interface PublicationSchedule {
  readonly approvedRevisionId: string;
  readonly approvedContentHash: string;
  readonly activateAt: string;
  readonly editorialTimeZone: string;
  readonly idempotencyKey: string;
}

export interface PublicationSnapshot {
  readonly id: string;
  readonly publicationId: string;
  readonly sourceRevisionId: string;
  readonly sourceRevisionNumber: number;
  readonly approvalHash: string;
  readonly activatedAt: string;
  readonly payload: Readonly<PublicPublicationSnapshotPayload>;
}

/** Deliberate public projection: no internal admin/workflow identifiers. */
export interface PublicPublicationSnapshotPayload {
  readonly content: RevisionContent;
  readonly seo: SeoMetadata;
  readonly authors: readonly RevisionAuthor[];
  readonly relations: readonly RevisionRelation[];
  readonly media: readonly RevisionMediaUse[];
}

export interface PublicationAggregate {
  readonly id: string;
  readonly kind: PublicationKind;
  readonly slug: string;
  readonly version: number;
  readonly workflow: WorkflowState;
  readonly release: ReleaseState;
  readonly discovery: DiscoveryDisposition;
  readonly currentRevision: PublicationRevision;
  readonly approval: PublicationApproval | null;
  readonly schedule: PublicationSchedule | null;
  readonly activeSnapshotId: string | null;
  readonly snapshots: readonly PublicationSnapshot[];
  /** Persist command fingerprints atomically with the transition in a real store. */
  readonly processedCommands: readonly ProcessedPublicationCommand[];
}

export interface ProcessedPublicationCommand {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
}

export interface PublicationCommandMeta {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface PublicationTransition {
  readonly aggregate: PublicationAggregate;
  readonly outcome: "APPLIED" | "ALREADY_APPLIED";
}

export interface StorageBackedMediaReference {
  readonly mediaAssetVersionId: string;
  readonly checksumSha256: string;
  readonly classification: "PUBLIC";
}
