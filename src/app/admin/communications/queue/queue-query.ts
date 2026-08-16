import {
  QUEUE_KINDS,
  QUEUE_VIEWS,
  type QueueKind,
  type QueueView,
} from "@/modules/communications/queue";

import type { QueuePageState } from "./queue-ui";

export type QueueSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numericValue(value: string | undefined) {
  if (value === undefined) return undefined;
  return Number(value);
}

function isQueueView(value: string | undefined): value is QueueView {
  return value !== undefined && QUEUE_VIEWS.includes(value as QueueView);
}

function isQueueKind(value: string | undefined): value is QueueKind {
  return value !== undefined && QUEUE_KINDS.includes(value as QueueKind);
}

export function parseQueueSearchParams(searchParams: QueueSearchParams) {
  const rawView = firstValue(searchParams.view);
  const rawKind = firstValue(searchParams.kind);
  const rawPage = firstValue(searchParams.page);
  const rawPageSize = firstValue(searchParams.pageSize);
  const rawOwner = firstValue(searchParams.owner);
  const invalid = {
    view: rawView !== undefined && !isQueueView(rawView),
    kind: rawKind !== undefined && !isQueueKind(rawKind),
    page:
      rawPage !== undefined &&
      (!Number.isSafeInteger(numericValue(rawPage)) ||
        numericValue(rawPage)! < 1),
    pageSize:
      rawPageSize !== undefined &&
      (!Number.isSafeInteger(numericValue(rawPageSize)) ||
        numericValue(rawPageSize)! < 1 ||
        numericValue(rawPageSize)! > 100),
  };
  const state: QueuePageState = {
    view: isQueueView(rawView) ? rawView : "MY_DRAFTS",
    kind: isQueueKind(rawKind) ? rawKind : "ALL",
    ...(rawOwner ? { owner: rawOwner } : {}),
    page: invalid.page ? 1 : (numericValue(rawPage) ?? 1),
    pageSize: invalid.pageSize ? 25 : (numericValue(rawPageSize) ?? 25),
  };
  return { state, invalid };
}
