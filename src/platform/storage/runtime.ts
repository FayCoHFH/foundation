import "server-only";

import { readServerEnvironment } from "@/platform/config/environment";

import {
  createLocalObjectStores,
  createLocalSubmissionClearanceEvidenceStore,
  createLocalSubmissionQuarantineStore,
} from "./local-object-store";
import type {
  PublicObjectStorePort,
  SubmissionClearanceEvidenceStoragePort,
  SubmissionQuarantineStoragePort,
} from "./contracts";

const globalForSubmissionStorage = globalThis as unknown as {
  submissionQuarantineStores?: Map<string, SubmissionQuarantineStoragePort>;
  submissionClearanceEvidenceStores?: Map<
    string,
    SubmissionClearanceEvidenceStoragePort
  >;
  publicObjectStores?: Map<string, PublicObjectStorePort>;
};

export function getRuntimeSubmissionQuarantineStorage(): SubmissionQuarantineStoragePort | null {
  const environment = readServerEnvironment();
  if (environment.storageDriver !== "local") return null;
  const rootDirectory = `${environment.localStorageRoot}/submission-quarantine`;
  const stores =
    globalForSubmissionStorage.submissionQuarantineStores ?? new Map();
  globalForSubmissionStorage.submissionQuarantineStores = stores;
  let store = stores.get(rootDirectory);
  if (!store) {
    store = createLocalSubmissionQuarantineStore({ rootDirectory });
    stores.set(rootDirectory, store);
  }
  return store;
}

export function getRuntimeSubmissionClearanceEvidenceStorage(): SubmissionClearanceEvidenceStoragePort | null {
  const environment = readServerEnvironment();
  if (environment.storageDriver !== "local") return null;
  const rootDirectory = `${environment.localStorageRoot}/submission-clearance-evidence`;
  const stores =
    globalForSubmissionStorage.submissionClearanceEvidenceStores ?? new Map();
  globalForSubmissionStorage.submissionClearanceEvidenceStores = stores;
  let store = stores.get(rootDirectory);
  if (!store) {
    store = createLocalSubmissionClearanceEvidenceStore({ rootDirectory });
    stores.set(rootDirectory, store);
  }
  return store;
}

export function getRuntimePublicObjectStore(): PublicObjectStorePort | null {
  const environment = readServerEnvironment();
  if (environment.storageDriver !== "local") return null;
  const rootDirectory = `${environment.localStorageRoot}/public`;
  const stores = globalForSubmissionStorage.publicObjectStores ?? new Map();
  globalForSubmissionStorage.publicObjectStores = stores;
  let store = stores.get(rootDirectory);
  if (!store) {
    store = createLocalObjectStores({
      publicRootDirectory: rootDirectory,
      privateRootDirectory: `${environment.localStorageRoot}/private`,
      privateGrantSigningSecret: environment.authSecret,
    }).publicStore;
    stores.set(rootDirectory, store);
  }
  return store;
}
