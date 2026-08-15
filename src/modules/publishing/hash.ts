import { createHash } from "node:crypto";

import type { PublicationRevisionInput } from "./contracts";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function isPlainRecord(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Publication hashes cannot contain non-finite numbers.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object") {
    if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length) {
      throw new Error(
        "Publication hashes accept only JSON primitives, arrays, and plain string-keyed objects.",
      );
    }
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => [key, canonicalize(record[key])]),
    );
  }

  throw new Error("Publication hashes cannot contain unsupported values.");
}

/**
 * Hash v1 canonicalizes the complete revision payload. New formats must add a
 * hash version rather than changing this algorithm in place.
 */
export function canonicalPublicationHash(
  input: PublicationRevisionInput,
): string {
  return canonicalValueHash(input);
}

export function canonicalValueHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}
