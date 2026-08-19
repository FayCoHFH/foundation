import Link from "next/link";
import { OrganizationNameLockup } from "@/components/site/organization-name-lockup";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getFeaturedNews, getLatestNews } from "@/modules/communications/news";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";
export const dynamic = "force-dynamic";
function formatted(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
export default async function NewsIndex() {
  const [featured, latest] = await Promise.all([
    getFeaturedNews(prisma),
    getLatestNews(prisma),
  ]);
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <header className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">
              <OrganizationNameLockup />
            </p>
            <h1 className="public-page-title">News &amp; updates</h1>
            <p className="public-page-deck">
              Timely news from our work alongside Fayette County neighbors.
            </p>
          </div>
        </header>
        <div className="public-content-wrap">
          {featured ? (
            <section
              aria-labelledby="featured-news-heading"
              className="public-clay-rule"
            >
              <p className="public-kicker">Featured news</p>
              <h2
                id="featured-news-heading"
                className="text-brand-black type-display mt-3 text-4xl leading-tight font-semibold sm:text-5xl"
              >
                <Link
                  className="underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
                  href={`/news/${featured.slug}`}
                >
                  {featured.headline}
                </Link>
              </h2>
              <p className="text-muted-foreground mt-4 max-w-3xl text-lg leading-8">
                {featured.summary}
              </p>
              <time
                className="text-brand-traditional-blue mt-5 block text-sm font-semibold"
                dateTime={featured.publishedAt.toISOString()}
              >
                {formatted(featured.publishedAt)}
              </time>
            </section>
          ) : null}
          <section
            className="public-section-rule mt-20"
            aria-labelledby="latest-news-heading"
          >
            <h2 id="latest-news-heading" className="public-section-heading">
              Latest news
            </h2>
            {latest.length ? (
              <ol className="public-rule-list mt-8">
                {latest.map((item) => (
                  <li key={item.slug} className="py-7">
                    <time
                      className="text-brand-traditional-blue text-sm font-semibold"
                      dateTime={item.publishedAt.toISOString()}
                    >
                      {formatted(item.publishedAt)}
                    </time>
                    <h3 className="text-brand-black type-display mt-2 text-2xl font-semibold">
                      <Link
                        className="underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
                        href={`/news/${item.slug}`}
                      >
                        {item.headline}
                      </Link>
                    </h3>
                    <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
                      {item.summary}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground mt-5">
                There are no current News updates at this time.
              </p>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
