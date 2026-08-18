/** Provider-neutral object storage contracts. Object metadata is stored by the
 * calling media domain in production; the local adapter retains it only to
 * support development and tests. */

export const objectClassifications = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
export type ObjectClassification = (typeof objectClassifications)[number];

export type ObjectStoreScope = "PUBLIC" | "PRIVATE";
export type PrivateContentDisposition = "attachment" | "inline";

export interface ObjectMetadata {
  readonly key: string;
  readonly scope: ObjectStoreScope;
  readonly classification: ObjectClassification;
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly createdAt: Date;
  readonly contentDisposition: PrivateContentDisposition | null;
}

export interface PutObjectInput {
  /** Must be an opaque, server-generated immutable key. */
  readonly key: string;
  readonly body: Uint8Array;
  /** This value must have been determined by server-side validation. */
  readonly contentType: string;
  readonly classification: ObjectClassification;
  readonly contentDisposition?: PrivateContentDisposition;
}

export interface StoredObject {
  readonly metadata: ObjectMetadata;
  readonly body: Uint8Array;
}

export interface ObjectStorePort {
  readonly scope: ObjectStoreScope;
  put(input: PutObjectInput): Promise<ObjectMetadata>;
  head(key: string): Promise<ObjectMetadata | null>;
  read(key: string): Promise<StoredObject | null>;
}

export interface PrivateDownloadGrant {
  /** Opaque, signed, short-lived grant for an authenticated server route. */
  readonly token: string;
  readonly objectKey: string;
  readonly subjectId: string;
  readonly expiresAt: Date;
}

export interface PrivateObjectStorePort {
  readonly scope: "PRIVATE";
  put(input: PutObjectInput): Promise<ObjectMetadata>;
  createDownloadGrant(input: {
    readonly key: string;
    readonly subjectId: string;
    readonly ttlSeconds?: number;
  }): Promise<PrivateDownloadGrant>;
  readWithDownloadGrant(input: {
    readonly token: string;
    readonly subjectId: string;
  }): Promise<StoredObject | null>;
}

/**
 * Server-only private quarantine access for untrusted submission originals.
 * This intentionally has no public URL or anonymous/grant consumer surface.
 */
export interface SubmissionQuarantineStoragePort {
  /** Writes a raw, untrusted original into the confidential quarantine. */
  put(input: PutObjectInput): Promise<ObjectMetadata>;
  /** Writes a server-generated confidential review derivative. */
  putReviewDerivative(input: PutObjectInput): Promise<ObjectMetadata>;
  readForProcessing(key: string): Promise<StoredObject | null>;
  statForProcessing(key: string): Promise<ObjectMetadata | null>;
  deleteForCleanup(key: string): Promise<void>;
}

/**
 * A distinct confidential boundary for clearance evidence. It intentionally
 * does not offer public URLs, listings, or private-store download grants.
 */
export interface SubmissionClearanceEvidenceStoragePort {
  putOriginal(input: PutObjectInput): Promise<ObjectMetadata>;
  putReviewDerivative(input: PutObjectInput): Promise<ObjectMetadata>;
  readForProcessing(key: string): Promise<StoredObject | null>;
  /** Called only after the evidence service has authorized and audited access. */
  readForAuthorizedReview(key: string): Promise<StoredObject | null>;
  deleteForCleanup(key: string): Promise<void>;
}

export interface ObjectStores {
  readonly publicStore: ObjectStorePort;
  readonly privateStore: PrivateObjectStorePort;
}
