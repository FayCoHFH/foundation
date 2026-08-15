import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  PLACEMENT_KEYS,
  getPlacementState,
} from "@/modules/communications/placements";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { homepagePlacementForm } from "./actions";
import {
  HOMEPAGE_PLACEMENT_NOTICE_MESSAGES,
  isHomepagePlacementNoticeCode,
} from "./notice";

const keys = PLACEMENT_KEYS.filter((key) => key !== "NEWS_FEATURED");
export default async function HomepageCuration({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") redirect("/admin/access-denied");
  const notice = (await searchParams).notice;
  const canManage = hasCapability(
    access.principal,
    "communications.placements.manage",
  );
  const [placements, stories, news] = await Promise.all([
    Promise.all(keys.map((key) => getPlacementState(prisma, key))),
    prisma.publicStoryProjection.findMany({
      where: {
        publication: {
          releaseState: "PUBLISHED",
          discoveryDisposition: "ACTIVE",
        },
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.publicNewsProjection.findMany({
      where: {
        publication: {
          releaseState: "PUBLISHED",
          discoveryDisposition: "ACTIVE",
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { publishedAt: "desc" },
    }),
  ]);
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={[
        { href: "/admin/communications/news", label: "News" },
        {
          href: "/admin/communications/homepage",
          label: "Homepage curation",
          current: true,
        },
      ]}
    >
      <h1 className="font-serif text-4xl">Homepage curation</h1>
      <p className="text-muted-foreground mt-3">
        Select currently public Stories and News for the three code-owned
        homepage placements.
      </p>
      {isHomepagePlacementNoticeCode(notice) ? (
        <p
          role="status"
          data-notice-code={notice}
          className="mt-4 font-semibold"
        >
          {HOMEPAGE_PLACEMENT_NOTICE_MESSAGES[notice]}
        </p>
      ) : null}
      <div className="mt-8 space-y-8">
        {keys.map((key, index) => {
          const state = placements[index]!;
          const current = state.current;
          const choices =
            key === "HOME_FEATURED_STORY"
              ? stories
              : key === "HOME_FEATURED_NEWS"
                ? news
                : [...stories, ...news];
          return (
            <section key={key} className="border-border border-t pt-6">
              <h2 className="font-serif text-2xl">
                {key.replaceAll("_", " ")}
              </h2>
              <p className="text-muted-foreground mt-2">
                {current?.publication.publicProjection?.headline ??
                  current?.publication.publicNewsProjection?.headline ??
                  "No effective assignment"}
              </p>
              {state.upcoming ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  Upcoming:{" "}
                  {state.upcoming.publication.publicProjection?.headline ??
                    state.upcoming.publication.publicNewsProjection?.headline}
                </p>
              ) : null}
              {canManage ? (
                <form
                  action={homepagePlacementForm}
                  className="mt-4 flex flex-wrap gap-3"
                >
                  <input type="hidden" name="placement" value={key} />
                  <select
                    name="publicationId"
                    aria-label={`${key} eligible content`}
                    className="border-border min-h-10 rounded-sm border px-2"
                  >
                    {choices.map((item) => (
                      <option
                        key={item.publicationId}
                        value={item.publicationId}
                      >
                        {item.headline}
                      </option>
                    ))}
                  </select>
                  <button
                    name="action"
                    value="assign"
                    formNoValidate
                    className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 font-semibold"
                  >
                    Assign
                  </button>
                  <input
                    name="startsAt"
                    type="datetime-local"
                    aria-label={`${key} future activation`}
                    aria-describedby={`${key}-future-help`}
                    required
                    className="border-border min-h-10 rounded-sm border px-2"
                  />
                  <button
                    name="action"
                    value="schedule"
                    className="border-border min-h-10 rounded-sm border px-3 font-semibold"
                  >
                    Schedule
                  </button>
                  <p
                    id={`${key}-future-help`}
                    className="text-muted-foreground basis-full text-sm"
                  >
                    Required for scheduled assignments.
                  </p>
                  <button
                    name="action"
                    value="clear"
                    formNoValidate
                    className="border-border min-h-10 rounded-sm border px-3 font-semibold"
                  >
                    Clear
                  </button>
                  {state.upcoming ? (
                    <>
                      <input
                        type="hidden"
                        name="placementId"
                        value={state.upcoming.id}
                      />
                      <button
                        name="action"
                        value="cancel"
                        formNoValidate
                        className="border-border min-h-10 rounded-sm border px-3 font-semibold"
                      >
                        Cancel upcoming
                      </button>
                    </>
                  ) : null}
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
