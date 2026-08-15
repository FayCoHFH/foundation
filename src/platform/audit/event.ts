import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  isSensitiveFieldName,
  isSensitiveStringValue,
} from "@/platform/logging/logger";

type AuditScalar = boolean | number | string | null;
type AuditSummaryValue = AuditScalar | readonly AuditScalar[];
export type AuditSummary = Readonly<Record<string, AuditSummaryValue>>;

type SystemActor = {
  actorKind: "SYSTEM";
  actorAdminUserId?: never;
};

type AdminActor = {
  actorKind: "ADMIN_USER";
  actorAdminUserId: string;
};

export type AuditEventInput = (SystemActor | AdminActor) & {
  action: string;
  targetType: string;
  targetId?: string;
  outcome?: "SUCCEEDED" | "DENIED" | "FAILED";
  correlationId?: string;
  summary: AuditSummary;
};

function validateSummary(summary: AuditSummary) {
  for (const key of Object.keys(summary)) {
    if (isSensitiveFieldName(key)) {
      throw new Error(`Audit summary key is prohibited: ${key}`);
    }
    const values = Array.isArray(summary[key]) ? summary[key] : [summary[key]];
    if (
      values.some(
        (value) => typeof value === "string" && isSensitiveStringValue(value),
      )
    ) {
      throw new Error(`Audit summary value is prohibited for key: ${key}`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(summary), "utf8") > 8 * 1024) {
    throw new Error("Audit summary exceeds the 8 KiB foundation limit.");
  }
}

/**
 * Builds the bounded, redacted metadata for an append-only audit row. Callers
 * create the row inside the same transaction as the consequential mutation.
 */
export function buildAuditEvent(
  input: AuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  validateSummary(input.summary);
  return {
    actorKind: input.actorKind,
    ...(input.actorKind === "ADMIN_USER"
      ? { actorAdminUserId: input.actorAdminUserId }
      : {}),
    action: input.action,
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    outcome: input.outcome ?? "SUCCEEDED",
    correlationId: input.correlationId ?? randomUUID(),
    summary: input.summary,
  };
}
