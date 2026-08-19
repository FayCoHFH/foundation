import Link from "next/link";

import type { SiteNoticeAdmin } from "@/modules/communications/notices";
import { formatEditorialDateTime } from "@/platform/time/editorial";

import {
  noticeSeverityLabel,
  noticeStatusLabel,
  noticeTargetLabel,
} from "./form-contract";

export function SiteNoticeListContent({
  notices,
  canCreate,
}: {
  notices: readonly SiteNoticeAdmin[];
  canCreate: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
            Communications
          </p>
          <h1 className="text-brand-black type-display mt-3 text-4xl">
            Site Notices
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Temporary operational messages for the public site. Notices remain
            as administrative records after expiry or withdrawal.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/communications/notices/new"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold no-underline"
          >
            Create Site Notice
          </Link>
        ) : null}
      </div>
      {notices.length ? (
        <ul className="border-border mt-10 divide-y border-y">
          {notices.map((notice) => (
            <li
              key={notice.id}
              className="grid min-w-0 gap-5 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,auto)] sm:items-start"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
                  <span>{noticeSeverityLabel(notice.severity)}</span>
                  <span className="text-muted-foreground">
                    {noticeTargetLabel(notice.targetArea)}
                  </span>
                  <span className="text-muted-foreground">
                    Lifecycle: {noticeStatusLabel(notice.lifecycle)}
                  </span>
                  <span className="text-muted-foreground">
                    Status: {noticeStatusLabel(notice.status)}
                  </span>
                </div>
                <h2 className="text-brand-black type-display mt-2 text-2xl">
                  <Link
                    href={`/admin/communications/notices/${notice.id}`}
                    className="underline underline-offset-4"
                  >
                    {notice.title || "Untitled draft"}
                  </Link>
                </h2>
                <p className="text-muted-foreground mt-2 max-w-2xl break-words">
                  {notice.message || "Message required before publishing."}
                </p>
              </div>
              <dl className="grid gap-2 text-sm sm:min-w-60">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="font-semibold">Starts</dt>
                  <dd>
                    {notice.startsAt ? (
                      <time dateTime={notice.startsAt.toISOString()}>
                        {formatEditorialDateTime(notice.startsAt)}
                      </time>
                    ) : (
                      "Not set"
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="font-semibold">Ends</dt>
                  <dd>
                    {notice.endsAt ? (
                      <time dateTime={notice.endsAt.toISOString()}>
                        {formatEditorialDateTime(notice.endsAt)}
                      </time>
                    ) : (
                      "Not set"
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="font-semibold">Updated</dt>
                  <dd>
                    <time dateTime={notice.updatedAt.toISOString()}>
                      {formatEditorialDateTime(notice.updatedAt)}
                    </time>
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="font-semibold">Updated by</dt>
                  <dd>{notice.updaterDisplayName}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border mt-10 border-t pt-7">
          <h2 className="type-display text-2xl">No Site Notices yet</h2>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Temporary operational messages will appear here as they are created.
          </p>
          {canCreate ? (
            <Link
              href="/admin/communications/notices/new"
              className="text-primary mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            >
              Create Site Notice
            </Link>
          ) : null}
        </div>
      )}
    </>
  );
}
