import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import {
  ADMIN_SUBMISSION_PAGE_SIZE,
  ADMIN_SUBMISSION_MAX_PAGE_SIZE,
  PUBLIC_STORY_SUBMISSION_STATUSES,
} from "@/modules/communications/submissions";

export const SUBMISSION_STATUS_OPTIONS = [
  { value: undefined, label: "All" },
  { value: PublicStorySubmissionStatus.RECEIVED, label: "Received" },
  { value: PublicStorySubmissionStatus.IN_REVIEW, label: "In Review" },
  { value: PublicStorySubmissionStatus.FOLLOW_UP, label: "Follow Up" },
  { value: PublicStorySubmissionStatus.ACCEPTED, label: "Accepted" },
  { value: PublicStorySubmissionStatus.DECLINED, label: "Declined" },
  { value: PublicStorySubmissionStatus.SPAM, label: "Spam" },
] as const;

const STATUS_LABELS: Record<PublicStorySubmissionStatus, string> = {
  RECEIVED: "Received",
  IN_REVIEW: "In Review",
  FOLLOW_UP: "Follow Up",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  SPAM: "Spam",
};

const EMPTY_MESSAGES: Record<PublicStorySubmissionStatus, string> = {
  RECEIVED: "No new Story submissions are waiting for triage.",
  IN_REVIEW: "No Story submissions are currently in review.",
  FOLLOW_UP: "No Story submissions are waiting for follow-up.",
  ACCEPTED: "No Story submissions have been accepted.",
  DECLINED: "No declined Story submissions match this view.",
  SPAM: "No submissions are marked as spam.",
};

export type SubmissionPageState = Readonly<{
  status?: PublicStorySubmissionStatus;
  page: number;
  pageSize: number;
}>;

export type SubmissionQueryInvalid = Readonly<{
  status: boolean;
  page: boolean;
  pageSize: boolean;
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  if (value === undefined) return { value: 1, invalid: false };
  const page = Number(value);
  return {
    value: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    invalid: !Number.isSafeInteger(page) || page < 1,
  };
}

function parsePageSize(value: string | undefined) {
  if (value === undefined)
    return { value: ADMIN_SUBMISSION_PAGE_SIZE, invalid: false };
  const pageSize = Number(value);
  return {
    value:
      Number.isSafeInteger(pageSize) &&
      pageSize >= 1 &&
      pageSize <= ADMIN_SUBMISSION_MAX_PAGE_SIZE
        ? pageSize
        : ADMIN_SUBMISSION_PAGE_SIZE,
    invalid:
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > ADMIN_SUBMISSION_MAX_PAGE_SIZE,
  };
}

export function parseSubmissionSearchParams(
  params: Readonly<Record<string, string | string[] | undefined>>,
) {
  const rawStatus = firstValue(params.status);
  const status = PUBLIC_STORY_SUBMISSION_STATUSES.find(
    (candidate) => candidate === rawStatus,
  );
  const statusInvalid = rawStatus !== undefined && !status;
  const page = parsePage(firstValue(params.page));
  const pageSize = parsePageSize(firstValue(params.pageSize));
  return {
    state: {
      ...(status ? { status } : {}),
      page: page.value,
      pageSize: pageSize.value,
    } satisfies SubmissionPageState,
    invalid: {
      status: statusInvalid,
      page: page.invalid,
      pageSize: pageSize.invalid,
    } satisfies SubmissionQueryInvalid,
  };
}

export function submissionStatusLabel(
  status: PublicStorySubmissionStatus | undefined,
) {
  return status ? STATUS_LABELS[status] : "All";
}

export function submissionEmptyMessage(
  status: PublicStorySubmissionStatus | undefined,
) {
  return status
    ? EMPTY_MESSAGES[status]
    : "No Story submissions match this view.";
}

export function submissionHref(state: SubmissionPageState) {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.pageSize !== ADMIN_SUBMISSION_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  }
  const query = params.toString();
  return `/admin/communications/submissions${query ? `?${query}` : ""}`;
}
