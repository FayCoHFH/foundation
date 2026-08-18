import "server-only";

import { readServerEnvironment } from "@/platform/config/environment";

import { createLocalSubmissionQuarantineStore } from "./local-object-store";
import type { SubmissionQuarantineStoragePort } from "./contracts";

const globalForSubmissionStorage = globalThis as unknown as {
  submissionQuarantineStores?: Map<string, SubmissionQuarantineStoragePort>;
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
