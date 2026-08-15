import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ParticipationInvitation } from "@/components/editorial/participation-invitation";
import { StoryBody } from "@/components/editorial/story-body";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicStoryBySlug } from "@/modules/communications/stories";
import { prisma } from "@/platform/database/prisma";

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
      <main id="main-content" tabIndex={-1} className="flex-1">
        <article>
          <header className="border-border bg-editorial-sky/45 border-b">
            <div className="editorial-arrival mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
              <div className="max-w-4xl">
                <p className="text-editorial-pecan text-sm font-bold tracking-[0.16em] uppercase">
                  A Fayette County Habitat Story
                </p>
                <h1 className="text-editorial-pecan mt-5 font-serif text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
                  {story.headline}
                </h1>
                {story.deck ? (
                  <p className="text-muted-foreground mt-7 max-w-2xl text-xl leading-8 sm:text-2xl sm:leading-9">
                    {story.deck}
                  </p>
                ) : null}
                <div className="text-editorial-pecan mt-10 flex items-center gap-3 text-sm font-semibold">
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
          <div className="mx-auto max-w-[43rem] px-5 py-14 sm:px-8 sm:py-20">
            <p className="border-editorial-oak/40 text-editorial-pecan border-l-2 pl-5 font-serif text-xl leading-8 sm:text-2xl">
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
