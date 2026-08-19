import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ParticipationInvitation } from "@/components/editorial/participation-invitation";
import { StoryBody } from "@/components/editorial/story-body";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicStoryBySlug } from "@/modules/communications/stories";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const story = await getPublicStoryBySlug(prisma, (await params).slug);
  if (!story) return {};
  return {
    title: story.headline,
    description: story.excerpt,
    alternates: { canonical: `/stories/${story.slug}` },
  };
}

export default async function PublicStoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const story = await getPublicStoryBySlug(prisma, (await params).slug);
  if (!story) notFound();
  const publishedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(story.publishedAt);

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <article>
          <header className="public-page-header">
            <div className="editorial-arrival public-page-header-inner">
              <div className="max-w-4xl">
                <p className="public-kicker">A Fayette County Habitat Story</p>
                <h1 className="public-page-title mt-5 max-w-none">
                  {story.headline}
                </h1>
                {story.deck ? (
                  <p className="text-muted-foreground mt-7 max-w-2xl text-xl leading-8 sm:text-2xl sm:leading-9">
                    {story.deck}
                  </p>
                ) : null}
                <div className="text-workshop-green mt-10 flex items-center gap-3 text-sm font-semibold">
                  <span
                    className="bg-editorial-paintbrush h-px w-9"
                    aria-hidden="true"
                  />
                  <time dateTime={story.publishedAt.toISOString()}>
                    Published {publishedDate}
                  </time>
                </div>
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-[46rem] px-5 py-16 sm:px-8 sm:py-24">
            <p className="border-habitat-green text-charcoal border-l-2 pl-5 font-serif text-2xl leading-9 sm:text-3xl">
              {story.excerpt}
            </p>
            <div className="mt-12">
              <StoryBody node={story.body.root} />
            </div>
          </div>
          <ParticipationInvitation headline={story.headline} />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
