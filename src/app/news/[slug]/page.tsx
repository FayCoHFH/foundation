import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryBody } from "@/components/editorial/story-body";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicNewsBySlug } from "@/modules/communications/news";
import { prisma } from "@/platform/database/prisma";
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
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <article>
          <header className="border-border bg-editorial-sky/30 border-b">
            <div className="editorial-arrival mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-18 lg:px-12">
              <p className="text-editorial-pecan text-sm font-bold tracking-[0.16em] uppercase">
                News &amp; updates
              </p>
              <h1 className="text-editorial-pecan mt-4 max-w-4xl font-serif text-4xl leading-[1.02] tracking-[-0.03em] sm:text-6xl">
                {news.headline}
              </h1>
              <time
                className="text-editorial-pecan mt-7 block text-sm font-semibold"
                dateTime={news.publishedAt.toISOString()}
              >
                Published {date}
              </time>
            </div>
          </header>
          <div className="mx-auto max-w-[42rem] px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-editorial-pecan font-serif text-2xl leading-9">
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
