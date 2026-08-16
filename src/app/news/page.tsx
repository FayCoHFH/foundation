import Link from "next/link";
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
        <header className="bg-editorial-sky/30 border-border border-b">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
            <p className="text-editorial-pecan text-sm font-bold tracking-[.16em] uppercase">
              Fayette County Habitat
            </p>
            <h1 className="text-editorial-pecan mt-4 font-serif text-5xl tracking-[-.035em] sm:text-6xl">
              News &amp; updates
            </h1>
            <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
              Timely news from our work alongside Fayette County neighbors.
            </p>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
          {featured ? (
            <section
              aria-labelledby="featured-news-heading"
              className="border-editorial-paintbrush bg-editorial-cream border-l-4 p-7 sm:p-10"
            >
              <p className="text-editorial-pecan text-sm font-bold tracking-[.14em] uppercase">
                Featured news
              </p>
              <h2
                id="featured-news-heading"
                className="text-editorial-pecan mt-3 font-serif text-3xl sm:text-4xl"
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
                className="text-editorial-pecan mt-5 block text-sm font-semibold"
                dateTime={featured.publishedAt.toISOString()}
              >
                {formatted(featured.publishedAt)}
              </time>
            </section>
          ) : null}
          <section className="mt-14" aria-labelledby="latest-news-heading">
            <h2
              id="latest-news-heading"
              className="text-editorial-pecan font-serif text-3xl"
            >
              Latest news
            </h2>
            {latest.length ? (
              <ol className="border-border mt-7 divide-y border-y">
                {latest.map((item) => (
                  <li key={item.slug} className="py-7">
                    <time
                      className="text-editorial-oak text-sm font-semibold"
                      dateTime={item.publishedAt.toISOString()}
                    >
                      {formatted(item.publishedAt)}
                    </time>
                    <h3 className="text-editorial-pecan mt-2 font-serif text-2xl">
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
