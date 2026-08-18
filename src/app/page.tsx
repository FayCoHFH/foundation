import type { Metadata } from "next";
import Link from "next/link";

import { CampaignActions } from "@/components/campaigns/campaign-presentation";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
} from "@/app/admin/campaigns/campaign-constants";
import { PROJECT_STATUS_LABELS } from "@/app/admin/projects/project-constants";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { listCurrentPublicCampaigns } from "@/modules/communications/campaigns";
import { getLatestNews } from "@/modules/communications/news";
import { getEffectivePlacement } from "@/modules/communications/placements";
import { listCurrentPublicProjects } from "@/modules/communications/projects";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Foundation environment",
};

function target(item: Awaited<ReturnType<typeof getEffectivePlacement>>) {
  if (!item) return null;
  const story = item.story;
  const news = item.news;
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
    donateDestination,
    volunteerDestination,
  ] = await Promise.all([
    getEffectivePlacement(prisma, "HOME_HERO"),
    getEffectivePlacement(prisma, "HOME_FEATURED_STORY"),
    getEffectivePlacement(prisma, "HOME_FEATURED_NEWS"),
    getLatestNews(prisma),
    listCurrentPublicProjects(prisma, { limit: 3 }),
    listCurrentPublicCampaigns(prisma, { limit: 3 }),
    getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    getPublicGlobalDestination(prisma, "GENERAL_VOLUNTEER"),
  ]);
  const selectedUpdate = target(heroRow);
  const story = target(storyRow);
  const news = target(newsRow);
  const activeCampaign = campaigns[0] ?? null;
  const shownNews = new Set([news?.href]);

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="main-content" tabIndex={-1} className="public-page-main flex-1">
        <SiteNoticeRegion targetArea={SiteNoticeTargetArea.HOMEPAGE} />

        <section className="border-limestone bg-clean-white border-b">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-12 lg:px-12 lg:py-20">
            <div className="editorial-arrival flex flex-col justify-center">
              <p className="public-kicker">
                Fayette County Habitat for Humanity
              </p>
              <h1 className="text-timber mt-5 max-w-3xl font-serif text-5xl leading-[0.94] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]">
                Building and repairing homes with neighbors across Fayette
                County.
              </h1>
              <p className="text-muted-foreground mt-7 max-w-2xl text-lg leading-8 sm:text-xl">
                We bring practical work and community support together to help
                local families build a stronger place to call home.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="public-action-primary" href="/projects">
                  Explore our work <span aria-hidden="true">→</span>
                </Link>
                {donateDestination ? (
                  <a
                    className="public-action-secondary"
                    href={donateDestination.url}
                    aria-label="Donate (opens the secure DonorView giving page)"
                  >
                    Donate <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <Link className="public-action-secondary" href="/give">
                    Learn about giving <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </div>
            <div className="public-hero-structure" aria-hidden="true">
              <span className="public-hero-structure-frame" />
              <span className="public-hero-structure-post" />
            </div>
          </div>
        </section>

        <div className="public-content-wrap">
          <section aria-labelledby="home-work" className="public-section-rule">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="public-kicker">What we do</p>
                <h2 id="home-work" className="public-section-heading mt-3">
                  The work is visible in the places we share.
                </h2>
                <p className="public-section-intro">
                  Follow current Projects by their place, progress, and public
                  purpose.
                </p>
              </div>
              <Link className="public-action-secondary" href="/projects">
                All Projects <span aria-hidden="true">→</span>
              </Link>
            </div>
            {projects.length ? (
              <ul className="public-rule-list mt-8">
                {projects.map((project) => (
                  <li key={project.slug}>
                    <article className="grid gap-3 md:grid-cols-[0.8fr_1.2fr] md:gap-10">
                      <div>
                        <p className="text-workshop-green text-sm font-bold">
                          {PROJECT_STATUS_LABELS[project.projectStatus]} ·{" "}
                          {project.community}
                        </p>
                        <h3 className="text-timber mt-2 font-serif text-2xl font-semibold sm:text-3xl">
                          <Link
                            className="decoration-habitat-blue/40 hover:text-habitat-blue underline underline-offset-4"
                            href={`/projects/${project.slug}`}
                          >
                            {project.title}
                          </Link>
                        </h3>
                      </div>
                      <p className="text-muted-foreground max-w-2xl leading-7">
                        {project.summary}
                      </p>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-limestone bg-warm-paper mt-8 border p-6">
                Projects will appear here as they are ready to share.
              </p>
            )}
          </section>

          <section
            aria-labelledby="ways-to-help"
            className="public-help-band mt-20"
          >
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div>
                <p className="text-clean-white text-sm font-bold tracking-[0.08em] uppercase">
                  Ways to help
                </p>
                <h2
                  id="ways-to-help"
                  className="mt-3 font-serif text-4xl leading-tight font-semibold"
                >
                  Bring what you can to the work.
                </h2>
              </div>
              <p className="text-clean-white/85 max-w-2xl text-lg leading-8">
                Giving and volunteering are different kinds of participation,
                with the same local purpose.
              </p>
            </div>
            <div className="border-clean-white/30 mt-9 grid gap-8 border-t pt-8 md:grid-cols-2">
              <div>
                <h3 className="font-serif text-2xl">Give</h3>
                <p className="text-clean-white/85 mt-2 max-w-md leading-7">
                  Support Habitat’s building and repair work across Fayette
                  County.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="public-action-primary" href="/give">
                    Learn about giving <span aria-hidden="true">→</span>
                  </Link>
                  {donateDestination ? (
                    <a
                      className="text-clean-white inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                      href={donateDestination.url}
                      aria-label="Donate (opens the secure DonorView giving page)"
                    >
                      Donate ↗
                    </a>
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="font-serif text-2xl">Volunteer</h3>
                <p className="text-clean-white/85 mt-2 max-w-md leading-7">
                  Bring time, skills, and practical care to a workday or the
                  wider effort.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="public-action-primary" href="/volunteer">
                    Learn about volunteering <span aria-hidden="true">→</span>
                  </Link>
                  {volunteerDestination ? (
                    <a
                      className="text-clean-white inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                      href={volunteerDestination.url}
                      aria-label="Volunteer (opens DonorView volunteer registration)"
                    >
                      Volunteer ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {activeCampaign ? (
            <section
              aria-labelledby="current-campaign"
              className="public-section-rule mt-20"
            >
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="public-kicker">A current effort</p>
                  <h2
                    id="current-campaign"
                    className="public-section-heading mt-3"
                  >
                    Rally around a shared purpose.
                  </h2>
                </div>
                <Link className="public-action-secondary" href="/campaigns">
                  All Campaigns <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="border-habitat-green bg-warm-paper mt-8 grid gap-8 border-t-4 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
                <div>
                  <p className="text-workshop-green text-sm font-bold">
                    {CAMPAIGN_STATUS_LABELS[activeCampaign.campaignStatus]} ·{" "}
                    {CAMPAIGN_TYPE_LABELS[activeCampaign.campaignType]}
                  </p>
                  <h3 className="text-timber mt-3 font-serif text-3xl font-semibold">
                    <Link
                      className="decoration-habitat-blue/40 hover:text-habitat-blue underline underline-offset-4"
                      href={`/campaigns/${activeCampaign.slug}`}
                    >
                      {activeCampaign.title}
                    </Link>
                  </h3>
                </div>
                <div>
                  <p className="text-muted-foreground max-w-2xl leading-7">
                    {activeCampaign.summary}
                  </p>
                  <CampaignActions campaign={activeCampaign} />
                </div>
              </div>
            </section>
          ) : null}

          {story ? (
            <section
              aria-labelledby="featured-story"
              className="public-section-rule mt-20"
            >
              <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
                <p className="public-kicker">Featured story</p>
                <div>
                  <h2
                    id="featured-story"
                    className="text-timber font-serif text-4xl leading-tight font-semibold sm:text-5xl"
                  >
                    <Link
                      className="decoration-habitat-blue/40 hover:text-habitat-blue underline underline-offset-4"
                      href={story.href}
                    >
                      {story.headline}
                    </Link>
                  </h2>
                  <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-8">
                    {story.summary}
                  </p>
                  <Link
                    className="text-habitat-blue mt-5 inline-flex font-semibold underline underline-offset-4"
                    href={story.href}
                  >
                    Read the Story{" "}
                    <span aria-hidden="true" className="ml-2">
                      →
                    </span>
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {selectedUpdate ? (
            <section
              aria-labelledby="selected-update"
              className="public-clay-rule mt-20"
            >
              <p className="public-kicker">Selected update</p>
              <h2
                id="selected-update"
                className="text-timber mt-3 font-serif text-3xl font-semibold"
              >
                <Link
                  className="decoration-texas-clay/50 hover:text-habitat-blue underline underline-offset-4"
                  href={selectedUpdate.href}
                >
                  {selectedUpdate.headline}
                </Link>
              </h2>
              <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
                {selectedUpdate.summary}
              </p>
            </section>
          ) : null}

          <section
            aria-labelledby="latest-news"
            className="public-section-rule mt-20"
          >
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="public-kicker">News &amp; updates</p>
                <h2 id="latest-news" className="public-section-heading mt-3">
                  Keep up with the work.
                </h2>
              </div>
              <Link className="public-action-secondary" href="/news">
                All News <span aria-hidden="true">→</span>
              </Link>
            </div>
            {news ? (
              <article id="featured-news" className="public-clay-rule mt-8">
                <p className="public-kicker">Featured news</p>
                <h3 className="text-timber mt-3 font-serif text-3xl font-semibold">
                  <Link
                    className="decoration-texas-clay/50 hover:text-habitat-blue underline underline-offset-4"
                    href={news.href}
                  >
                    {news.headline}
                  </Link>
                </h3>
                <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
                  {news.summary}
                </p>
              </article>
            ) : null}
            <ul className="public-rule-list mt-8">
              {latest
                .filter((item) => !shownNews.has(`/news/${item.slug}`))
                .slice(0, 3)
                .map((item) => (
                  <li key={item.slug}>
                    <article className="grid gap-2 md:grid-cols-[0.25fr_0.75fr] md:gap-8">
                      <time
                        className="text-workshop-green text-sm font-semibold"
                        dateTime={item.publishedAt.toISOString()}
                      >
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(item.publishedAt)}
                      </time>
                      <div>
                        <h3 className="text-timber font-serif text-2xl font-semibold">
                          <Link
                            className="decoration-habitat-blue/40 hover:text-habitat-blue underline underline-offset-4"
                            href={`/news/${item.slug}`}
                          >
                            {item.headline}
                          </Link>
                        </h3>
                        <p className="text-muted-foreground mt-2 max-w-3xl leading-7">
                          {item.summary}
                        </p>
                      </div>
                    </article>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
