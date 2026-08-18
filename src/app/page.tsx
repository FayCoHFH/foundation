import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getLatestNews } from "@/modules/communications/news";
import { listCurrentPublicCampaigns } from "@/modules/communications/campaigns";
import { listCurrentPublicProjects } from "@/modules/communications/projects";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { getEffectivePlacement } from "@/modules/communications/placements";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Foundation environment",
};
function target(item: Awaited<ReturnType<typeof getEffectivePlacement>>) {
  if (!item) return null;
  const story = item.story,
    news = item.news;
  if (story)
    return {
      label: "Story",
      href: `/stories/${story.slug}`,
      headline: story.headline,
      summary: story.deck ?? story.excerpt,
      date: story.publishedAt,
    };
  if (news)
    return {
      label: "News",
      href: `/news/${news.slug}`,
      headline: news.headline,
      summary: news.summary,
      date: news.publishedAt,
    };
  return null;
}
export default async function HomePage() {
  const [
    heroRow,
    storyRow,
    newsRow,
    latest,
    projects,
    campaigns,
    volunteerDestination,
  ] = await Promise.all([
    getEffectivePlacement(prisma, "HOME_HERO"),
    getEffectivePlacement(prisma, "HOME_FEATURED_STORY"),
    getEffectivePlacement(prisma, "HOME_FEATURED_NEWS"),
    getLatestNews(prisma),
    listCurrentPublicProjects(prisma, { limit: 3 }),
    listCurrentPublicCampaigns(prisma, { limit: 3 }),
    getPublicGlobalDestination(prisma, "GENERAL_VOLUNTEER"),
  ]);
  const hero = target(heroRow),
    story = target(storyRow),
    news = target(newsRow);
  const shown = new Set([hero?.href, news?.href]);
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <SiteNoticeRegion targetArea={SiteNoticeTargetArea.HOMEPAGE} />
        <section className="border-border bg-editorial-sky/40 border-b">
          <div className="editorial-arrival mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
            <p className="text-sm font-bold tracking-[.16em] text-[#32281f] uppercase">
              Fayette County Habitat for Humanity
            </p>
            {hero ? (
              <>
                <p className="mt-7 text-sm font-bold tracking-[.14em] text-[#32281f] uppercase">
                  Featured {hero.label}
                </p>
                <h1 className="text-editorial-pecan mt-3 max-w-4xl font-serif text-5xl leading-[.98] tracking-[-.035em] sm:text-6xl lg:text-7xl">
                  <Link href={hero.href}>{hero.headline}</Link>
                </h1>
                <p className="mt-7 max-w-2xl text-xl leading-8 text-[#32281f]">
                  {hero.summary}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-editorial-pecan mt-5 max-w-4xl font-serif text-5xl leading-[.98] tracking-[-.035em] sm:text-6xl lg:text-7xl">
                  A place where many kinds of help can meet.
                </h1>
                <p className="mt-8 max-w-2xl text-xl leading-8 text-[#32281f]">
                  This public experience is being built to make local work
                  easier to understand, trust, and join.
                </p>
              </>
            )}
          </div>
        </section>
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
          {story ? (
            <section
              aria-labelledby="featured-story"
              className="border-border border-t py-12"
            >
              <p className="text-primary text-sm font-bold tracking-[.14em] uppercase">
                Featured story
              </p>
              <h2
                id="featured-story"
                className="text-editorial-pecan mt-3 font-serif text-4xl"
              >
                <Link href={story.href}>{story.headline}</Link>
              </h2>
              <p className="text-muted-foreground mt-4 max-w-3xl text-lg leading-8">
                {story.summary}
              </p>
            </section>
          ) : null}
          {news ? (
            <section
              aria-labelledby="featured-news"
              className="border-editorial-paintbrush bg-editorial-cream border-l-4 p-7 sm:p-10"
            >
              <p className="text-editorial-pecan text-sm font-bold tracking-[.14em] uppercase">
                Featured news
              </p>
              <h2
                id="featured-news"
                className="text-editorial-pecan mt-3 font-serif text-3xl"
              >
                <Link href={news.href}>{news.headline}</Link>
              </h2>
              <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
                {news.summary}
              </p>
            </section>
          ) : null}
          <section className="mt-14" aria-labelledby="latest-news">
            <h2
              id="latest-news"
              className="text-editorial-pecan font-serif text-3xl"
            >
              Latest news
            </h2>
            {latest
              .filter((item) => !shown.has(`/news/${item.slug}`))
              .slice(0, 3)
              .map((item) => (
                <article
                  key={item.slug}
                  className="border-border border-b py-6"
                >
                  <h3 className="text-editorial-pecan font-serif text-2xl">
                    <Link href={`/news/${item.slug}`}>{item.headline}</Link>
                  </h3>
                  <p className="text-muted-foreground mt-2">{item.summary}</p>
                </article>
              ))}
          </section>
          <section
            aria-labelledby="home-work"
            className="border-border mt-16 border-t pt-12"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-primary text-sm font-bold tracking-[.14em] uppercase">
                  The work
                </p>
                <h2
                  id="home-work"
                  className="text-editorial-pecan mt-3 font-serif text-4xl"
                >
                  Local work, shared purpose.
                </h2>
              </div>
              <div className="flex gap-5 text-sm font-semibold">
                <Link className="underline underline-offset-4" href="/projects">
                  All Projects →
                </Link>
                <Link
                  className="underline underline-offset-4"
                  href="/campaigns"
                >
                  All Campaigns →
                </Link>
              </div>
            </div>
            <div className="mt-8 grid gap-10 md:grid-cols-2">
              <section aria-labelledby="home-projects">
                <h3 id="home-projects" className="font-serif text-2xl">
                  Current Projects
                </h3>
                {projects.length ? (
                  <ul className="mt-3">
                    {projects.map((project) => (
                      <li
                        key={project.slug}
                        className="border-border border-t py-4"
                      >
                        <Link
                          className="decoration-primary/40 font-semibold underline underline-offset-4"
                          href={`/projects/${project.slug}`}
                        >
                          {project.title}
                        </Link>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {project.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-3">
                    Projects will appear here as they are ready to share.
                  </p>
                )}
              </section>
              <section aria-labelledby="home-campaigns">
                <h3 id="home-campaigns" className="font-serif text-2xl">
                  Current Campaigns
                </h3>
                {campaigns.length ? (
                  <ul className="mt-3">
                    {campaigns.map((campaign) => (
                      <li
                        key={campaign.slug}
                        className="border-border border-t py-4"
                      >
                        <Link
                          className="decoration-primary/40 font-semibold underline underline-offset-4"
                          href={`/campaigns/${campaign.slug}`}
                        >
                          {campaign.title}
                        </Link>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {campaign.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-3">
                    Campaigns will appear here as they are ready to share.
                  </p>
                )}
              </section>
            </div>
          </section>
          <section
            aria-labelledby="ways-to-help"
            className="bg-editorial-cream border-editorial-paintbrush mt-16 border-l-4 p-7 sm:p-10"
          >
            <p className="text-primary text-sm font-bold tracking-[.14em] uppercase">
              Ways to help
            </p>
            <h2
              id="ways-to-help"
              className="text-editorial-pecan mt-3 font-serif text-4xl"
            >
              There is a place for your support.
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div>
                <h3 className="font-serif text-2xl">Donate</h3>
                <p className="text-muted-foreground mt-2 leading-7">
                  Give to Habitat’s work across Fayette County.
                </p>
                <Link
                  className="mt-3 inline-block font-semibold underline underline-offset-4"
                  href="/give"
                >
                  Learn about giving →
                </Link>
              </div>
              <div>
                <h3 className="font-serif text-2xl">Volunteer</h3>
                <p className="text-muted-foreground mt-2 leading-7">
                  Bring time and practical care to the work.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  <Link
                    className="font-semibold underline underline-offset-4"
                    href="/volunteer"
                  >
                    Learn about volunteering →
                  </Link>
                  {volunteerDestination ? (
                    <a
                      className="font-semibold underline underline-offset-4"
                      href={volunteerDestination.url}
                      aria-label="Volunteer (opens DonorView volunteer registration)"
                    >
                      Volunteer ↗
                    </a>
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="font-serif text-2xl">Explore Campaigns</h3>
                <p className="text-muted-foreground mt-2 leading-7">
                  Follow a current effort and its next step.
                </p>
                <Link
                  className="mt-3 inline-block font-semibold underline underline-offset-4"
                  href="/campaigns"
                >
                  See current Campaigns →
                </Link>
              </div>
            </div>
          </section>
          <section className="border-border mt-16 border-t pt-10">
            <h2 className="text-editorial-pecan font-serif text-3xl">
              Make room for participation.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl leading-7">
              Welcome time, talent, useful goods, attention, and support.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
