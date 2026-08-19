import Link from "next/link";

import type {
  CommunicationsDashboard,
  DashboardActivityItem,
  DashboardCurationSlot,
  DashboardNeedsAttentionGroup,
  DashboardPlacementAssignment,
  DashboardUpcomingItem,
  DashboardModuleVisibility,
} from "@/modules/communications/dashboard";

const NEEDS_ATTENTION_LABELS = {
  NEEDS_REVIEW: "Needs Review",
  NEEDS_APPROVAL: "Needs Approval",
  APPROVED_UNRELEASED: "Approved, Not Released",
} as const;

const NEEDS_ATTENTION_EMPTY =
  "There are no actionable publication items for your current access.";

const CURATION_STATUS_LABELS = {
  ACTIVE: "Active",
  EMPTY: "Empty",
  UPCOMING_ONLY: "Upcoming only",
  CONFIGURED_BUT_INEFFECTIVE: "Configured but not currently effective",
  CURRENT_AND_UPCOMING: "Current and upcoming",
} as const;

const ACTIVITY_LABELS: Record<string, string> = {
  "story.create": "created a Story",
  "story.submit": "submitted a Story for review",
  "story.review.request_changes": "requested Story changes",
  "story.review.send_for_approval": "sent a Story for approval",
  "story.approve": "approved a Story",
  "story.release": "released a Story",
  "story.withdraw": "withdrew a Story",
  "story.archive": "archived a Story",
  "story.owner.assign": "assigned a Story owner",
  "news.create": "created News",
  "news.submit": "submitted News for review",
  "news.request_changes": "requested News changes",
  "news.send_for_approval": "sent News for approval",
  "news.approve": "approved News",
  "news.release": "released News",
  "news.withdraw": "withdrew News",
  "news.archive": "archived News",
  "placement.assigned": "assigned a placement",
  "placement.replaced": "replaced a placement",
  "placement.cleared": "cleared a placement",
  "placement.cancelled": "cancelled an upcoming placement",
};

function formatDate(value: Date) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

function kindLabel(kind: "STORY" | "NEWS") {
  return kind === "STORY" ? "Story" : "News";
}

function subjectLabel(kind: "STORY" | "NEWS" | "PLACEMENT") {
  return kind === "PLACEMENT" ? "Placement" : kindLabel(kind);
}

function queueViewPath(view: keyof typeof NEEDS_ATTENTION_LABELS) {
  return `/admin/communications/queue?view=${view}`;
}

function Section({
  children,
  heading,
  id,
}: {
  children: React.ReactNode;
  heading: string;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="border-border border-t pt-6">
      <h2 id={id} className="type-display text-2xl">
        {heading}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Timestamp({ label, value }: { label: string; value: Date }) {
  return (
    <span className="text-muted-foreground text-sm">
      {label} <time dateTime={value.toISOString()}>{formatDate(value)}</time>
    </span>
  );
}

function PublicationLink({
  path,
  kind,
  headline,
}: {
  path: string;
  kind: "STORY" | "NEWS";
  headline: string;
}) {
  return (
    <Link
      href={path}
      className="text-foreground hover:text-primary font-semibold underline decoration-1 underline-offset-4"
    >
      <span className="text-primary mr-2 text-sm">{kindLabel(kind)}</span>
      {headline}
    </Link>
  );
}

function NeedsAttentionGroup({
  group,
}: {
  group: DashboardNeedsAttentionGroup;
}) {
  const label = NEEDS_ATTENTION_LABELS[group.key];
  const timestampLabel =
    group.key === "NEEDS_APPROVAL"
      ? "Awaiting approval since"
      : group.key === "APPROVED_UNRELEASED"
        ? "Approved"
        : "Waiting since";
  return (
    <section aria-labelledby={`dashboard-${group.key.toLowerCase()}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3
          id={`dashboard-${group.key.toLowerCase()}`}
          className="text-lg font-semibold"
        >
          {label}
          <span className="text-muted-foreground ml-2 text-sm tabular-nums">
            {group.count}
          </span>
        </h3>
        <Link
          href={queueViewPath(group.key)}
          className="text-primary min-h-11 content-center text-sm font-semibold underline underline-offset-4"
        >
          View all in Publication Queue
        </Link>
      </div>
      {group.items.length ? (
        <ul className="divide-border mt-3 divide-y border-b">
          {group.items.map((item) => (
            <li
              key={item.publicationId}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
            >
              <div className="min-w-0">
                <PublicationLink
                  path={item.detailPath}
                  kind={item.publicationKind}
                  headline={item.headline}
                />
                {item.editorialOwner ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    Editorial owner: {item.editorialOwner.displayName}
                  </p>
                ) : null}
                {item.approvalBlockedReasonCode === "SELF_APPROVAL" ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Another qualified approver is required.
                  </p>
                ) : null}
              </div>
              <Timestamp label={timestampLabel} value={item.relevantAt} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">
          No items in this group.
        </p>
      )}
    </section>
  );
}

function NeedsAttention({
  module,
  visible,
}: {
  module: CommunicationsDashboard["needsAttention"];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Section heading="Needs Attention" id="dashboard-needs-attention">
      {module ? (
        <div className="space-y-7">
          {module.groups
            .filter((group) => group.count > 0)
            .map((group) => (
              <NeedsAttentionGroup key={group.key} group={group} />
            ))}
          {module.groups.every((group) => group.count === 0) ? (
            <p className="text-muted-foreground">{NEEDS_ATTENTION_EMPTY}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">{NEEDS_ATTENTION_EMPTY}</p>
      )}
    </Section>
  );
}

function AssignmentSummary({
  assignment,
  label,
}: {
  assignment: DashboardPlacementAssignment;
  label: string;
}) {
  return (
    <div className="border-border bg-surface-subtle rounded-sm border p-3">
      <p className="text-muted-foreground text-sm font-semibold">{label}</p>
      <p className="mt-1">
        {assignment.headline ? (
          <PublicationLink
            path={assignment.adminPath}
            kind={assignment.targetKind}
            headline={assignment.headline}
          />
        ) : (
          `${kindLabel(assignment.targetKind)} target`
        )}
      </p>
      <Timestamp label="Activates" value={assignment.startsAt} />
      {assignment.endsAt ? (
        <span className="text-muted-foreground ml-2 text-sm">
          Ends{" "}
          <time dateTime={assignment.endsAt.toISOString()}>
            {formatDate(assignment.endsAt)}
          </time>
        </span>
      ) : null}
    </div>
  );
}

function CurationSlot({ slot }: { slot: DashboardCurationSlot }) {
  return (
    <li className="border-border border-b py-5 first:border-t">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">{slot.label}</h3>
        <span className="text-muted-foreground text-sm font-semibold">
          {CURATION_STATUS_LABELS[slot.status]}
        </span>
      </div>
      {slot.status === "CONFIGURED_BUT_INEFFECTIVE" ? (
        <p className="text-muted-foreground mt-2 text-sm">
          The configured item is no longer publicly eligible.
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {slot.current ? (
          <AssignmentSummary
            assignment={slot.current}
            label="Current assignment"
          />
        ) : null}
        {slot.upcoming ? (
          <AssignmentSummary
            assignment={slot.upcoming}
            label="Upcoming assignment"
          />
        ) : null}
        {!slot.current && !slot.upcoming ? (
          <p className="text-muted-foreground text-sm">
            No assignment is configured.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function UpcomingItem({ item }: { item: DashboardUpcomingItem }) {
  if (item.kind === "NEWS_EXPIRATION") {
    return (
      <li className="border-border grid gap-2 border-b py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
        <div>
          <p className="text-primary text-sm font-semibold">News expiration</p>
          <Link
            href={item.adminPath}
            className="text-foreground hover:text-primary font-semibold underline decoration-1 underline-offset-4"
          >
            {item.headline}
          </Link>
        </div>
        <Timestamp label="Expires" value={item.expiresAt} />
      </li>
    );
  }
  return (
    <li className="border-border grid gap-2 border-b py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
      <div>
        <p className="text-primary text-sm font-semibold">
          Placement activation · {item.placementLabel}
        </p>
        {item.headline ? (
          <PublicationLink
            path={item.adminPath}
            kind={item.targetKind}
            headline={item.headline}
          />
        ) : (
          <p className="font-semibold">{kindLabel(item.targetKind)} target</p>
        )}
        <Link
          href="/admin/communications/homepage"
          className="text-primary mt-2 inline-block min-h-11 content-center text-sm font-semibold underline underline-offset-4"
        >
          Manage Homepage curation
        </Link>
      </div>
      <Timestamp label="Activates" value={item.startsAt} />
    </li>
  );
}

function Upcoming({
  module,
  visible,
}: {
  module: CommunicationsDashboard["upcoming"];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Section heading="Upcoming" id="dashboard-upcoming">
      {module?.items.length ? (
        <>
          <p className="text-muted-foreground text-sm">
            Upcoming in the next{" "}
            {Math.round(
              (module.upcomingUntil.getTime() -
                module.evaluationTime.getTime()) /
                (24 * 60 * 60 * 1_000),
            )}{" "}
            days
          </p>
          <ul className="mt-2">
            {module.items.map((item) => (
              <UpcomingItem
                key={
                  item.kind === "PLACEMENT_ACTIVATION"
                    ? item.placementId
                    : item.publicationId
                }
                item={item}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground">
          No Communications deadlines or curation changes fall within the
          current window.
        </p>
      )}
    </Section>
  );
}

function activityText(item: DashboardActivityItem) {
  const label =
    ACTIVITY_LABELS[item.action] ?? "updated a Communications record";
  return item.headline
    ? `${item.actorDisplayName} ${label}: ${item.headline}`
    : `${item.actorDisplayName} ${label}`;
}

function RecentActivity({
  module,
  visible,
}: {
  module: CommunicationsDashboard["recentActivity"];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Section heading="Recent Activity" id="dashboard-recent-activity">
      {module.items.length ? (
        <ol className="divide-border divide-y border-b">
          {module.items.map((item) => (
            <li
              key={item.id}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
            >
              <div>
                {item.detailPath ? (
                  <Link
                    href={item.detailPath}
                    className="text-foreground hover:text-primary font-semibold underline decoration-1 underline-offset-4"
                  >
                    {activityText(item)}
                  </Link>
                ) : (
                  <p className="font-semibold">{activityText(item)}</p>
                )}
                <p className="text-muted-foreground mt-1 text-sm">
                  {subjectLabel(item.subjectKind)}
                </p>
              </div>
              <time
                className="text-muted-foreground text-sm"
                dateTime={item.occurredAt.toISOString()}
              >
                {formatDate(item.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">
          No recent Communications activity is available.
        </p>
      )}
    </Section>
  );
}

export function DashboardContent({
  dashboard,
  errorMessage,
  visibility,
}: {
  dashboard: CommunicationsDashboard | null;
  errorMessage?: string;
  visibility: DashboardModuleVisibility;
}) {
  return (
    <div>
      <p className="text-primary text-sm font-semibold">Communications</p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        Communications Dashboard
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
        Review editorial work, upcoming curation changes, and recent
        Communications activity.
      </p>
      {errorMessage ? (
        <section
          aria-labelledby="dashboard-error"
          className="border-border mt-8 border-t pt-6"
        >
          <h2 id="dashboard-error" className="text-lg font-semibold">
            Dashboard unavailable
          </h2>
          <p className="text-muted-foreground mt-2">{errorMessage}</p>
        </section>
      ) : dashboard ? (
        <div className="mt-10 space-y-10">
          <NeedsAttention
            module={dashboard.needsAttention}
            visible={visibility.needsAttention}
          />
          <Upcoming module={dashboard.upcoming} visible={visibility.upcoming} />
          {visibility.currentCuration && dashboard.currentCuration ? (
            <Section heading="Current Curation" id="dashboard-current-curation">
              <p className="text-muted-foreground text-sm">
                The four code-owned placement slots and their effective
                assignments.
              </p>
              <ul className="mt-2">
                <>
                  {dashboard.currentCuration.slots.map((slot) => (
                    <CurationSlot key={slot.placementKey} slot={slot} />
                  ))}
                </>
              </ul>
              <Link
                href="/admin/communications/homepage"
                className="text-primary mt-4 inline-block min-h-11 content-center text-sm font-semibold underline underline-offset-4"
              >
                Manage Homepage curation
              </Link>
            </Section>
          ) : null}
          <RecentActivity
            module={dashboard.recentActivity}
            visible={visibility.recentActivity}
          />
        </div>
      ) : null}
    </div>
  );
}

export {
  ACTIVITY_LABELS,
  CURATION_STATUS_LABELS,
  NEEDS_ATTENTION_LABELS,
  formatDate,
};
