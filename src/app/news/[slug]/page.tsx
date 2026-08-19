import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsArticleJsonLd } from "@/components/editorial/news-article-json-ld";
import { StoryBody } from "@/components/editorial/story-body";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicNewsBySlug } from "@/modules/communications/news";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const news = await getPublicNewsBySlug(prisma, (await params).slug);
  if (!news) return {};
  return {
    title: news.headline,
    description: news.summary,
    alternates: { canonical: `/news/${news.slug}` },
    openGraph: {
      type: "article",
      title: news.headline,
      description: news.summary,
      publishedTime: news.publishedAt.toISOString(),
      modifiedTime: news.publishedAt.toISOString(),
    },
  };
}
export default async function NewsDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const news = await getPublicNewsBySlug(prisma, (await params).slug);
  if (!news) notFound();
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(news.publishedAt);
  return (
    <div className="flex min-h-screen flex-col">
      <NewsArticleJsonLd news={news} />
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <article>
          <header className="public-page-header">
            <div className="editorial-arrival public-page-header-inner">
              <p className="public-kicker">News &amp; updates</p>
              <h1 className="public-page-title">{news.headline}</h1>
              <time
                className="text-workshop-green mt-7 block text-sm font-semibold"
                dateTime={news.publishedAt.toISOString()}
              >
                Published {date}
              </time>
            </div>
          </header>
          <div className="mx-auto max-w-[46rem] px-5 py-14 sm:px-8 sm:py-20">
            <p className="text-charcoal font-serif text-3xl leading-tight">
              {news.summary}
            </p>
            <div className="mt-10">
              <StoryBody node={news.body.root} />
            </div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
