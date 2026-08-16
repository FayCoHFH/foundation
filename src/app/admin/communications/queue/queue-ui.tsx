import Link from "next/link";
import type { ReactNode } from "react";

import type {
  PublicationQueueItem,
  PublicationQueueOwnerOption,
  PublicationQueueResult,
  PublicationQueueSummary,
  QueueKind,
  QueueView,
} from "@/modules/communications/queue";

export const QUEUE_VIEW_DEFINITIONS = [
  {
    view: "MY_DRAFTS",
    label: "My Drafts",
    emptyMessage: "You have no draft communications.",
  },
  {
    view: "NEEDS_REVIEW",
    label: "Needs Review",
    emptyMessage: "Nothing is waiting for your review.",
  },
  {
    view: "NEEDS_APPROVAL",
    label: "Needs Approval",
    emptyMessage: "Nothing is waiting for approval.",
  },
  {
    view: "APPROVED_UNRELEASED",
    label: "Approved, Not Released",
    emptyMessage: "No approved communications are waiting to be released.",
  },
  {
    view: "RECENTLY_PUBLISHED",
    label: "Recently Published",
    emptyMessage: "No published communications match these filters.",
  },
  {
    view: "EXPIRED_NEWS",
    label: "Expired News",
    emptyMessage: "No expired News items match these filters.",
  },
  {
    view: "ARCHIVED",
    label: "Archived",
    emptyMessage: "No archived communications match these filters.",
  },
  {
    view: "ALL",
    label: "All",
    emptyMessage: "No communications match these filters.",
  },
] as const satisfies ReadonlyArray<{
  view: QueueView;
  label: string;
  emptyMessage: string;
}>;

const VIEW_LABELS = new Map<QueueView, string>(
  QUEUE_VIEW_DEFINITIONS.map(({ view, label }) => [view, label]),
);

const WORKFLOW_LABELS: Record<PublicationQueueItem["workflowState"], string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  PENDING_APPROVAL: "Needs approval",
  APPROVED: "Approved",
};

const RELEASE_LABELS: Record<PublicationQueueItem["releaseState"], string> = {
  UNPUBLISHED: "Not released",
  PUBLISHED: "Published",
  WITHDRAWN: "Withdrawn",
};

export type QueuePageState = Readonly<{
  view: QueueView;
  kind: QueueKind;
  owner?: string;
  page: number;
  pageSize: number;
}>;

export function queueViewLabel(view: QueueView) {
  return VIEW_LABELS.get(view) ?? "Publication Queue";
}

export function queueViewCount(
  summary: PublicationQueueSummary,
  view: QueueView,
) {
  switch (view) {
    case "ALL":
      return summary.all;
    case "MY_DRAFTS":
      return summary.myDrafts;
    case "NEEDS_REVIEW":
      return summary.needsReview;
    case "NEEDS_APPROVAL":
      return summary.needsApproval;
    case "APPROVED_UNRELEASED":
      return summary.approvedUnreleased;
    case "RECENTLY_PUBLISHED":
      return summary.recentlyPublished;
    case "EXPIRED_NEWS":
      return summary.expiredNews;
    case "ARCHIVED":
      return summary.archived;
  }
}

export function queueHref(state: QueuePageState) {
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (state.kind !== "ALL") params.set("kind", state.kind);
  if (state.owner) params.set("owner", state.owner);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.pageSize !== 25) params.set("pageSize", String(state.pageSize));
  return `/admin/communications/queue?${params.toString()}`;
}

function dateLabel(value: Date) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

function timestampForView(item: PublicationQueueItem, view: QueueView) {
  switch (view) {
    case "MY_DRAFTS":
      return { label: "Updated", value: item.updatedAt };
    case "NEEDS_REVIEW":
      return item.submittedAt
        ? { label: "Waiting since", value: item.submittedAt }
        : null;
    case "NEEDS_APPROVAL":
      return item.submittedAt
        ? { label: "Awaiting approval since", value: item.submittedAt }
        : null;
    case "APPROVED_UNRELEASED":
      return item.approvedAt
        ? { label: "Approved", value: item.approvedAt }
        : null;
    case "RECENTLY_PUBLISHED":
      return item.publishedAt
        ? { label: "Published", value: item.publishedAt }
        : null;
    case "EXPIRED_NEWS":
      return item.expiresAt
        ? { label: "Expired", value: item.expiresAt }
        : null;
    case "ARCHIVED":
      return item.archivedAt
        ? { label: "Archived", value: item.archivedAt }
        : null;
    case "ALL":
      return { label: "Updated", value: item.updatedAt };
  }
}

export function renderQueueStatus(item: PublicationQueueItem) {
  return {
    workflow: WORKFLOW_LABELS[item.workflowState],
    release: RELEASE_LABELS[item.releaseState],
    discovery: item.discoveryDisposition === "ARCHIVED" ? "Archived" : "Active",
    availability:
      item.newsAvailability === "EXPIRED"
        ? "Expired"
        : item.newsAvailability === "CURRENT"
          ? "Current News"
          : null,
  };
}

function QueueViewNavigation({
  availableViews,
  summary,
  state,
}: {
  availableViews: readonly QueueView[];
  summary: PublicationQueueSummary;
  state: QueuePageState;
}) {
  return (
    <nav aria-label="Publication Queue views">
      <h2 className="sr-only">Publication Queue views</h2>
      <ul className="border-border flex flex-wrap gap-2 border-b pb-4">
        {availableViews.map((view) => {
          const label = queueViewLabel(view);
          const count = queueViewCount(summary, view);
          const current = view === state.view;
          return (
            <li key={view}>
              <Link
                href={queueHref({ ...state, view, page: 1 })}
                aria-current={current ? "page" : undefined}
                aria-label={`${label}, ${count} items`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 text-sm font-semibold no-underline transition-colors focus-visible:outline ${current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-secondary"}`}
              >
                <span>{label}</span>
                <span aria-hidden="true" className="tabular-nums opacity-80">
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function QueueFilters({
  state,
  ownerOptions,
}: {
  state: QueuePageState;
  ownerOptions: readonly PublicationQueueOwnerOption[];
}) {
  return (
    <form
      method="get"
      aria-label="Filter Publication Queue"
      className="border-border bg-surface-subtle mt-6 grid gap-4 border-y py-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,18rem)_minmax(0,8rem)_auto] sm:items-end"
    >
      <input type="hidden" name="view" value={state.view} />
      <input type="hidden" name="page" value="1" />
      <label className="grid gap-1 text-sm font-semibold" htmlFor="queue-kind">
        Publication kind
        <select
          id="queue-kind"
          name="kind"
          defaultValue={state.kind}
          className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
        >
          <option value="ALL">All</option>
          <option value="STORY">Story</option>
          <option value="NEWS">News</option>
        </select>
      </label>
      {ownerOptions.length ? (
        <label
          className="grid gap-1 text-sm font-semibold"
          htmlFor="queue-owner"
        >
          Editorial owner
          <select
            id="queue-owner"
            name="owner"
            defaultValue={state.owner ?? ""}
            className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
          >
            <option value="">All owners</option>
            {ownerOptions.map((owner) => (
              <option key={owner.adminUserId} value={owner.adminUserId}>
                {owner.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label
        className="grid gap-1 text-sm font-semibold"
        htmlFor="queue-page-size"
      >
        Items per page
        <select
          id="queue-page-size"
          name="pageSize"
          defaultValue={String(state.pageSize)}
          className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>
      <button
        type="submit"
        className="bg-primary text-primary-foreground min-h-11 rounded-sm px-4 font-semibold"
      >
        Apply filters
      </button>
    </form>
  );
}

function QueueItem({
  item,
  view,
}: {
  item: PublicationQueueItem;
  view: QueueView;
}) {
  const status = renderQueueStatus(item);
  const timestamp = timestampForView(item, view);
  const kindLabel = item.publicationKind === "STORY" ? "Story" : "News";
  return (
    <li className="border-border border-b py-5 first:border-t sm:py-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)_auto] md:items-start md:gap-8">
        <div className="min-w-0">
          <p className="text-primary text-sm font-semibold">{kindLabel}</p>
          <h2 className="mt-1 text-xl leading-snug font-semibold">
            <Link
              href={item.detailPath}
              aria-label={`Open ${kindLabel}: ${item.headline}`}
              className="text-foreground hover:text-primary underline decoration-1 underline-offset-4"
            >
              {item.headline}
            </Link>
          </h2>
          <dl className="text-muted-foreground mt-3 grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-6">
            <div>
              <dt className="inline">Workflow: </dt>
              <dd className="text-foreground inline font-semibold">
                {status.workflow}
              </dd>
            </div>
            <div>
              <dt className="inline">Public state: </dt>
              <dd className="text-foreground inline font-semibold">
                {status.release}
              </dd>
            </div>
            {status.discovery === "Archived" ? (
              <div>
                <dt className="inline">Discovery: </dt>
                <dd className="text-foreground inline font-semibold">
                  Archived
                </dd>
              </div>
            ) : null}
            {status.availability ? (
              <div>
                <dt className="inline">Availability: </dt>
                <dd className="text-foreground inline font-semibold">
                  {status.availability}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Editorial owner</dt>
            <dd className="font-semibold">
              {item.editorialOwner?.displayName}
            </dd>
          </div>
          {timestamp ? (
            <div>
              <dt className="text-muted-foreground">{timestamp.label}</dt>
              <dd>
                <time dateTime={timestamp.value.toISOString()}>
                  {dateLabel(timestamp.value)}
                </time>
              </dd>
            </div>
          ) : null}
          {item.publicationKind === "NEWS" && item.expiresAt ? (
            <div>
              <dt className="text-muted-foreground">News expiration</dt>
              <dd>
                <time dateTime={item.expiresAt.toISOString()}>
                  {dateLabel(item.expiresAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="md:pt-1">
          <Link
            href={item.detailPath}
            aria-label={`Open ${kindLabel}: ${item.headline}`}
            className="border-border text-foreground hover:bg-secondary inline-flex min-h-11 items-center rounded-sm border px-3 py-2 text-sm font-semibold no-underline"
          >
            Open {kindLabel}
          </Link>
          {item.approvalBlockedReasonCode === "SELF_APPROVAL" ? (
            <p className="text-muted-foreground mt-3 max-w-48 text-sm leading-5">
              Another qualified approver is required.
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function QueueEmptyState({
  view,
  canCreateStory,
  canCreateNews,
}: {
  view: QueueView;
  canCreateStory: boolean;
  canCreateNews: boolean;
}) {
  const definition = QUEUE_VIEW_DEFINITIONS.find((item) => item.view === view);
  return (
    <section className="border-border mt-8 border-y py-10" aria-live="polite">
      <h2 className="font-serif text-2xl">Nothing here yet</h2>
      <p className="text-muted-foreground mt-2 max-w-xl">
        {definition?.emptyMessage ?? "No communications match these filters."}
      </p>
      {view === "MY_DRAFTS" && (canCreateStory || canCreateNews) ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {canCreateStory ? (
            <Link
              href="/admin/communications/stories/new"
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold no-underline"
            >
              Create Story draft
            </Link>
          ) : null}
          {canCreateNews ? (
            <Link
              href="/admin/communications/news/new"
              className="border-border text-foreground hover:bg-secondary inline-flex min-h-11 items-center rounded-sm border px-4 py-2 font-semibold no-underline"
            >
              Create News draft
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function QueueErrorState({ message }: { message: string }) {
  return (
    <section
      className="border-destructive/50 bg-destructive/5 mt-8 border-y py-8"
      role="alert"
    >
      <h2 className="font-serif text-2xl">Publication Queue unavailable</h2>
      <p className="text-muted-foreground mt-2 max-w-xl">{message}</p>
    </section>
  );
}

function QueuePagination({
  result,
  state,
}: {
  result: PublicationQueueResult;
  state: QueuePageState;
}) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const last = Math.min(result.total, result.page * result.pageSize);
  return (
    <nav
      aria-label="Publication Queue pagination"
      className="border-border mt-7 flex flex-wrap items-center justify-between gap-4 border-t pt-5"
    >
      <p className="text-muted-foreground text-sm">
        {result.total
          ? `Showing ${first}–${last} of ${result.total}`
          : "No items"}
        <span className="sr-only">
          . Page {result.page} of {totalPages}.
        </span>
      </p>
      <div className="flex items-center gap-2">
        {result.page > 1 ? (
          <Link
            href={queueHref({ ...state, page: result.page - 1 })}
            rel="prev"
            className="border-border text-foreground hover:bg-secondary inline-flex min-h-11 items-center rounded-sm border px-3 py-2 text-sm font-semibold no-underline"
          >
            Previous
          </Link>
        ) : null}
        <span aria-current="page" className="px-2 text-sm font-semibold">
          Page {result.page} of {totalPages}
        </span>
        {result.hasNextPage ? (
          <Link
            href={queueHref({ ...state, page: result.page + 1 })}
            rel="next"
            className="border-border text-foreground hover:bg-secondary inline-flex min-h-11 items-center rounded-sm border px-3 py-2 text-sm font-semibold no-underline"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function PublicationQueueContent({
  availableViews,
  ownerOptions,
  result,
  state,
  errorMessage,
  unavailableMessage,
  canCreateStory,
  canCreateNews,
}: {
  availableViews: readonly QueueView[];
  ownerOptions: readonly PublicationQueueOwnerOption[];
  result: PublicationQueueResult | null;
  state: QueuePageState;
  errorMessage: string | undefined;
  unavailableMessage: string | undefined;
  canCreateStory: boolean;
  canCreateNews: boolean;
}) {
  const summary = result?.summary ?? {
    all: 0,
    myDrafts: 0,
    needsReview: 0,
    needsApproval: 0,
    approvedUnreleased: 0,
    recentlyPublished: 0,
    expiredNews: 0,
    archived: 0,
  };
  return (
    <>
      <QueueViewNavigation
        availableViews={availableViews}
        summary={summary}
        state={state}
      />
      <QueueFilters state={state} ownerOptions={ownerOptions} />
      {unavailableMessage ? (
        <QueueErrorState message={unavailableMessage} />
      ) : errorMessage ? (
        <QueueErrorState message={errorMessage} />
      ) : result?.items.length ? (
        <>
          <ul
            aria-label={`${queueViewLabel(state.view)} items`}
            className="mt-2"
          >
            {result.items.map((item) => (
              <QueueItem
                key={item.publicationId}
                item={item}
                view={state.view}
              />
            ))}
          </ul>
          <QueuePagination result={result} state={state} />
        </>
      ) : (
        <QueueEmptyState
          view={state.view}
          canCreateStory={canCreateStory}
          canCreateNews={canCreateNews}
        />
      )}
    </>
  );
}

export function QueuePageHeader({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-primary text-sm font-semibold">Communications</p>
        <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
          Publication Queue
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
          Review the current Story and News workflow at a glance. Open an item
          to continue work in its typed administration screen.
        </p>
      </div>
      {children}
    </div>
  );
}
