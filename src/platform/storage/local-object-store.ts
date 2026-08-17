import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ObjectMetadata,
  ObjectStorePort,
  ObjectStoreScope,
  ObjectStores,
  PrivateDownloadGrant,
  PrivateObjectStorePort,
  PutObjectInput,
  SubmissionQuarantineStoragePort,
  StoredObject,
} from "./contracts";

const MAX_PRIVATE_GRANT_SECONDS = 10 * 60;

export class InvalidObjectKeyError extends Error {}
export class ObjectAlreadyExistsError extends Error {}
export class InvalidObjectGrantError extends Error {}

interface LocalStoreOptions {
  readonly rootDirectory: string;
  readonly scope: ObjectStoreScope;
  readonly signingSecret?: string;
  readonly now?: () => Date;
}

interface GrantPayload {
  readonly version: 1;
  readonly key: string;
  readonly subjectId: string;
  readonly expiresAtEpochSeconds: number;
  readonly nonce: string;
}

function base64UrlEncode(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** Opaque, immutable keys avoid filenames, email, and other sensitive data. */
export function createOpaqueObjectKey(namespace = "objects"): string {
  const safeNamespace = namespace.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (safeNamespace.length === 0) {
    throw new InvalidObjectKeyError(
      "Object key namespace must contain letters or numbers.",
    );
  }
  return `${safeNamespace}/${randomUUID().replaceAll("-", "")}`;
}

export function assertSafeObjectKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > 240 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("..") ||
    !/^[a-z0-9][a-z0-9/-]*$/i.test(key)
  ) {
    throw new InvalidObjectKeyError(
      "Object key is not a safe opaque storage key.",
    );
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeSignatureMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export class LocalObjectStore implements ObjectStorePort {
  readonly scope: ObjectStoreScope;
  protected readonly rootDirectory: string;
  protected readonly now: () => Date;
  protected readonly metadataByKey = new Map<string, ObjectMetadata>();

  constructor(options: LocalStoreOptions) {
    this.rootDirectory = path.resolve(options.rootDirectory);
    this.scope = options.scope;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: PutObjectInput): Promise<ObjectMetadata> {
    assertSafeObjectKey(input.key);
    this.assertClassification(input);
    const destination = this.destinationFor(input.key);
    const existing = await this.head(input.key);
    if (existing !== null) {
      throw new ObjectAlreadyExistsError(
        "Object keys are immutable and cannot be overwritten.",
      );
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    // Exclusive creation closes a race between head() and put().
    try {
      await fs.writeFile(destination, input.body, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ObjectAlreadyExistsError(
          "Object keys are immutable and cannot be overwritten.",
        );
      }
      throw error;
    }

    const metadata: ObjectMetadata = Object.freeze({
      key: input.key,
      scope: this.scope,
      classification: input.classification,
      contentType: input.contentType,
      byteSize: input.body.byteLength,
      checksumSha256: createHash("sha256").update(input.body).digest("hex"),
      createdAt: this.now(),
      contentDisposition:
        this.scope === "PRIVATE"
          ? (input.contentDisposition ?? "attachment")
          : null,
    });
    this.metadataByKey.set(input.key, metadata);
    return metadata;
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    assertSafeObjectKey(key);
    const metadata = this.metadataByKey.get(key);
    if (metadata === undefined) {
      return null;
    }
    try {
      await fs.access(this.destinationFor(key));
      return metadata;
    } catch {
      this.metadataByKey.delete(key);
      return null;
    }
  }

  async read(key: string): Promise<StoredObject | null> {
    const metadata = await this.head(key);
    if (metadata === null) {
      return null;
    }
    return {
      metadata,
      body: new Uint8Array(await fs.readFile(this.destinationFor(key))),
    };
  }

  protected async deleteObject(key: string): Promise<void> {
    assertSafeObjectKey(key);
    try {
      await fs.unlink(this.destinationFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.metadataByKey.delete(key);
  }

  protected destinationFor(key: string): string {
    assertSafeObjectKey(key);
    const destination = path.resolve(this.rootDirectory, key);
    const safePrefix = `${this.rootDirectory}${path.sep}`;
    if (!destination.startsWith(safePrefix)) {
      throw new InvalidObjectKeyError(
        "Object key resolves outside its storage root.",
      );
    }
    return destination;
  }

  private assertClassification(input: PutObjectInput): void {
    if (this.scope === "PUBLIC" && input.classification !== "PUBLIC") {
      throw new InvalidObjectKeyError(
        "Only approved Public objects may enter public storage.",
      );
    }
    if (this.scope === "PRIVATE" && input.classification === "PUBLIC") {
      throw new InvalidObjectKeyError(
        "Public objects belong in the public store.",
      );
    }
  }
}

class LocalPrivateObjectStore
  extends LocalObjectStore
  implements PrivateObjectStorePort
{
  readonly scope = "PRIVATE" as const;
  private readonly signingSecret: string;

  constructor(
    options: Omit<LocalStoreOptions, "scope"> & {
      readonly signingSecret: string;
    },
  ) {
    super({ ...options, scope: "PRIVATE" });
    if (options.signingSecret.length < 32) {
      throw new InvalidObjectGrantError(
        "Private-grant signing secret must be at least 32 characters.",
      );
    }
    this.signingSecret = options.signingSecret;
  }

  async createDownloadGrant(input: {
    readonly key: string;
    readonly subjectId: string;
    readonly ttlSeconds?: number;
  }): Promise<PrivateDownloadGrant> {
    if (input.subjectId.trim().length === 0) {
      throw new InvalidObjectGrantError(
        "A private download grant needs an authenticated subject.",
      );
    }
    if ((await this.head(input.key)) === null) {
      throw new InvalidObjectGrantError(
        "Cannot grant access to a missing private object.",
      );
    }
    const ttlSeconds = input.ttlSeconds ?? 5 * 60;
    if (ttlSeconds <= 0 || ttlSeconds > MAX_PRIVATE_GRANT_SECONDS) {
      throw new InvalidObjectGrantError("Private grants must be short-lived.");
    }
    const expiresAt = new Date(this.now().getTime() + ttlSeconds * 1000);
    const payload: GrantPayload = {
      version: 1,
      key: input.key,
      subjectId: input.subjectId,
      expiresAtEpochSeconds: Math.floor(expiresAt.getTime() / 1000),
      nonce: randomUUID(),
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    return {
      token: `${encodedPayload}.${sign(encodedPayload, this.signingSecret)}`,
      objectKey: input.key,
      subjectId: input.subjectId,
      expiresAt,
    };
  }

  async readWithDownloadGrant(input: {
    readonly token: string;
    readonly subjectId: string;
  }): Promise<StoredObject | null> {
    const payload = this.verifyGrant(input.token, input.subjectId);
    return this.read(payload.key);
  }

  private verifyGrant(token: string, subjectId: string): GrantPayload {
    const [encodedPayload, signature, ...rest] = token.split(".");
    if (
      encodedPayload === undefined ||
      signature === undefined ||
      rest.length !== 0
    ) {
      throw new InvalidObjectGrantError("Private download grant is malformed.");
    }
    const expectedSignature = sign(encodedPayload, this.signingSecret);
    if (!timingSafeSignatureMatches(signature, expectedSignature)) {
      throw new InvalidObjectGrantError(
        "Private download grant signature is invalid.",
      );
    }
    let payload: GrantPayload;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload)) as GrantPayload;
    } catch {
      throw new InvalidObjectGrantError(
        "Private download grant payload is invalid.",
      );
    }
    if (
      payload.version !== 1 ||
      payload.subjectId !== subjectId ||
      payload.expiresAtEpochSeconds * 1000 <= this.now().getTime()
    ) {
      throw new InvalidObjectGrantError(
        "Private download grant is expired or unauthorized.",
      );
    }
    assertSafeObjectKey(payload.key);
    return payload;
  }
}

class LocalSubmissionQuarantineStore
  extends LocalObjectStore
  implements SubmissionQuarantineStoragePort
{
  constructor(options: Omit<LocalStoreOptions, "scope">) {
    super({ ...options, scope: "PRIVATE" });
  }

  async put(input: PutObjectInput): Promise<ObjectMetadata> {
    if (input.classification !== "CONFIDENTIAL") {
      throw new InvalidObjectKeyError(
        "Submission quarantine accepts Confidential objects only.",
      );
    }
    if (!input.key.startsWith("submission-quarantine/")) {
      throw new InvalidObjectKeyError(
        "Submission quarantine keys must use the private quarantine namespace.",
      );
    }
    return super.put(input);
  }

  async putReviewDerivative(input: PutObjectInput): Promise<ObjectMetadata> {
    if (input.classification !== "CONFIDENTIAL") {
      throw new InvalidObjectKeyError(
        "Submission review derivatives must remain Confidential.",
      );
    }
    if (!input.key.startsWith("submission-review-derivative/")) {
      throw new InvalidObjectKeyError(
        "Submission review derivatives need their private derivative namespace.",
      );
    }
    return super.put(input);
  }

  readForProcessing(key: string) {
    return this.read(key);
  }

  statForProcessing(key: string) {
    return this.head(key);
  }

  deleteForCleanup(key: string) {
    return this.deleteObject(key);
  }
}

export function createLocalSubmissionQuarantineStore(options: {
  readonly rootDirectory: string;
  readonly now?: () => Date;
}): SubmissionQuarantineStoragePort {
  return new LocalSubmissionQuarantineStore({
    rootDirectory: options.rootDirectory,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export function createLocalObjectStores(options: {
  readonly publicRootDirectory: string;
  readonly privateRootDirectory: string;
  readonly privateGrantSigningSecret: string;
  readonly now?: () => Date;
}): ObjectStores {
  const privateAdapter = new LocalPrivateObjectStore({
    rootDirectory: options.privateRootDirectory,
    signingSecret: options.privateGrantSigningSecret,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  const privateStore: PrivateObjectStorePort = Object.freeze({
    scope: "PRIVATE" as const,
    put: (input: PutObjectInput) => privateAdapter.put(input),
    createDownloadGrant: (
      input: Parameters<PrivateObjectStorePort["createDownloadGrant"]>[0],
    ) => privateAdapter.createDownloadGrant(input),
    readWithDownloadGrant: (
      input: Parameters<PrivateObjectStorePort["readWithDownloadGrant"]>[0],
    ) => privateAdapter.readWithDownloadGrant(input),
  });

  return {
    publicStore: new LocalObjectStore({
      rootDirectory: options.publicRootDirectory,
      scope: "PUBLIC",
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    privateStore,
  };
}
