import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  InvalidObjectGrantError,
  InvalidObjectKeyError,
  ObjectAlreadyExistsError,
  createLocalObjectStores,
  createLocalSubmissionQuarantineStore,
  createOpaqueObjectKey,
} from "../../../src/platform/storage";

const temporaryRoots: string[] = [];

async function storesAt(now = new Date("2026-08-14T12:00:00.000Z")) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "habitat-storage-test-"),
  );
  temporaryRoots.push(root);
  return createLocalObjectStores({
    publicRootDirectory: path.join(root, "public"),
    privateRootDirectory: path.join(root, "private"),
    privateGrantSigningSecret:
      "test-private-grant-secret-which-is-at-least-32-characters",
    now: () => now,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("local provider-neutral object stores", () => {
  it("stores only approved Public objects in the public store with computed metadata", async () => {
    const stores = await storesAt();
    const key = createOpaqueObjectKey("media");
    const body = new TextEncoder().encode("approved image bytes");

    const metadata = await stores.publicStore.put({
      key,
      body,
      contentType: "image/jpeg",
      classification: "PUBLIC",
    });

    expect(metadata.scope).toBe("PUBLIC");
    expect(metadata.byteSize).toBe(body.byteLength);
    expect(metadata.checksumSha256).toHaveLength(64);
    expect(await stores.publicStore.read(key)).toMatchObject({
      metadata,
      body,
    });
    await expect(
      stores.publicStore.put({
        key,
        body,
        contentType: "image/jpeg",
        classification: "PUBLIC",
      }),
    ).rejects.toBeInstanceOf(ObjectAlreadyExistsError);
  });

  it("prevents a non-public classification from entering public storage", async () => {
    const stores = await storesAt();

    await expect(
      stores.publicStore.put({
        key: createOpaqueObjectKey(),
        body: new Uint8Array([1]),
        contentType: "application/pdf",
        classification: "CONFIDENTIAL",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectKeyError);
  });

  it("keeps private objects behind a signed, subject-bound, short-lived grant", async () => {
    const fixedNow = new Date("2026-08-14T12:00:00.000Z");
    const stores = await storesAt(fixedNow);
    const key = createOpaqueObjectKey("private-media");
    await stores.privateStore.put({
      key,
      body: new TextEncoder().encode("confidential evidence"),
      contentType: "application/pdf",
      classification: "CONFIDENTIAL",
    });

    expect("read" in stores.privateStore).toBe(false);
    expect("head" in stores.privateStore).toBe(false);
    if (false) {
      // @ts-expect-error Raw private reads are intentionally absent from the consumer port.
      void stores.privateStore.read;
      // @ts-expect-error Raw private metadata reads are intentionally absent from the consumer port.
      void stores.privateStore.head;
    }

    expect(await stores.publicStore.read(key)).toBeNull();
    const grant = await stores.privateStore.createDownloadGrant({
      key,
      subjectId: "admin-user-1",
      ttlSeconds: 60,
    });
    expect(grant.token).not.toContain("confidential evidence");
    expect(
      await stores.privateStore.readWithDownloadGrant({
        token: grant.token,
        subjectId: "admin-user-1",
      }),
    ).toMatchObject({ metadata: { key, scope: "PRIVATE" } });
    await expect(
      stores.privateStore.readWithDownloadGrant({
        token: grant.token,
        subjectId: "another-admin",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectGrantError);
    await expect(
      stores.privateStore.readWithDownloadGrant({
        token: `${grant.token}tampered`,
        subjectId: "admin-user-1",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectGrantError);
  });

  it("rejects path traversal before any local filesystem path can be resolved", async () => {
    const stores = await storesAt();

    await expect(
      stores.privateStore.put({
        key: "../outside",
        body: new Uint8Array([1]),
        contentType: "application/octet-stream",
        classification: "RESTRICTED",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectKeyError);
  });

  it("keeps submission quarantine server-only, opaque, and independently deletable", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "habitat-quarantine-test-"),
    );
    temporaryRoots.push(root);
    const quarantine = createLocalSubmissionQuarantineStore({
      rootDirectory: root,
    });
    const key = createOpaqueObjectKey("submission-quarantine");
    await quarantine.put({
      key,
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      classification: "CONFIDENTIAL",
    });
    expect((await quarantine.statForProcessing(key))?.key).toBe(key);
    expect((await quarantine.readForProcessing(key))?.body).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await quarantine.deleteForCleanup(key);
    expect(await quarantine.statForProcessing(key)).toBeNull();
    const derivativeKey = createOpaqueObjectKey("submission-review-derivative");
    await quarantine.putReviewDerivative({
      key: derivativeKey,
      body: new Uint8Array([4, 5, 6]),
      contentType: "image/jpeg",
      classification: "CONFIDENTIAL",
    });
    expect((await quarantine.statForProcessing(derivativeKey))?.scope).toBe(
      "PRIVATE",
    );
    await expect(
      quarantine.put({
        key: createOpaqueObjectKey("public"),
        body: new Uint8Array([1]),
        contentType: "image/png",
        classification: "CONFIDENTIAL",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectKeyError);
    await expect(
      quarantine.putReviewDerivative({
        key: createOpaqueObjectKey("submission-quarantine"),
        body: new Uint8Array([1]),
        contentType: "image/jpeg",
        classification: "CONFIDENTIAL",
      }),
    ).rejects.toBeInstanceOf(InvalidObjectKeyError);
  });
});
