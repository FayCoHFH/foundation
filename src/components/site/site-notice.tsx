import Link from "next/link";

import type { SiteNoticePublic } from "@/modules/communications/notices";
import {
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import { formatEditorialDateTime } from "@/platform/time/editorial";

const severityStyles: Record<SiteNoticeSeverity, string> = {
  [SiteNoticeSeverity.INFO]:
    "border-editorial-denim bg-editorial-sky/55 text-charcoal",
  [SiteNoticeSeverity.IMPORTANT]:
    "border-editorial-oak bg-pale-habitat-green text-charcoal",
  [SiteNoticeSeverity.URGENT]:
    "border-editorial-paintbrush bg-clean-white text-charcoal",
};

const severityLabels: Record<SiteNoticeSeverity, string> = {
  [SiteNoticeSeverity.INFO]: "Info",
  [SiteNoticeSeverity.IMPORTANT]: "Important",
  [SiteNoticeSeverity.URGENT]: "Urgent",
};

function NoticeItem({ notice }: { notice: SiteNoticePublic }) {
  const external = notice.ctaUrl?.startsWith("/") === false;
  return (
    <li>
      <article
        className={`border-l-4 p-5 sm:p-6 ${severityStyles[notice.severity]}`}
      >
        <p className="text-sm font-bold tracking-[.14em] uppercase">
          {severityLabels[notice.severity]}
        </p>
        <h3 className="mt-2 font-serif text-2xl leading-tight">
          {notice.title}
        </h3>
        <p className="mt-3 max-w-3xl leading-7">{notice.message}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          {notice.ctaLabel && notice.ctaUrl ? (
            <Link
              href={notice.ctaUrl}
              className="min-h-11 content-center underline underline-offset-4"
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {notice.ctaLabel}
              {external ? <span aria-hidden="true"> ↗</span> : null}
            </Link>
          ) : null}
          <span>
            Through{" "}
            <time dateTime={notice.endsAt.toISOString()}>
              {formatEditorialDateTime(notice.endsAt)}
            </time>
          </span>
        </div>
      </article>
    </li>
  );
}

export function SiteNoticeContent({
  targetArea,
  notices,
}: {
  targetArea: SiteNoticeTargetArea;
  notices: readonly SiteNoticePublic[];
}) {
  if (!notices.length) return null;
  const headingId = `site-notices-${targetArea.toLowerCase()}`;
  const label =
    targetArea === SiteNoticeTargetArea.SITE_WIDE
      ? "Operational notices"
      : "Homepage notices";
  return (
    <aside
      aria-labelledby={headingId}
      className="border-border bg-background mx-auto w-full max-w-7xl border-b px-5 py-5 sm:px-8 sm:py-6 lg:px-12"
    >
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      <ol className="grid gap-4">
        {notices.map((notice) => (
          <NoticeItem key={notice.id} notice={notice} />
        ))}
      </ol>
    </aside>
  );
}

export { NoticeItem, severityLabels, severityStyles };
