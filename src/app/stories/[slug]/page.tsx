import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicStoryBySlug } from "@/modules/communications/stories";
import { prisma } from "@/platform/database/prisma";

export const dynamic = "force-dynamic";

function StoryBody({ node }: { node: unknown }) {
  if (!node || typeof node !== "object") return null;
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === "text") return value.text ?? null;
  const children = value.content?.map((child, index) => (
    <StoryBody key={index} node={child} />
  ));
  if (value.type === "paragraph")
    return <p className="mt-5 text-lg leading-8">{children}</p>;
  if (value.type === "heading")
    return (
      <h2 className="mt-10 font-serif text-3xl leading-tight">{children}</h2>
    );
  if (value.type === "bulletList")
    return <ul className="mt-5 list-disc space-y-2 pl-6">{children}</ul>;
  if (value.type === "orderedList")
    return <ol className="mt-5 list-decimal space-y-2 pl-6">{children}</ol>;
  if (value.type === "listItem") return <li>{children}</li>;
  return <>{children}</>;
}

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
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <header className="border-border border-b pb-10">
            <p className="text-primary text-sm font-semibold tracking-wide">
              Story
            </p>
            <h1 className="text-foreground mt-4 font-serif text-4xl leading-tight sm:text-5xl">
              {story.headline}
            </h1>
            {story.deck ? (
              <p className="text-muted-foreground mt-5 text-xl leading-8">
                {story.deck}
              </p>
            ) : null}
            <p className="text-muted-foreground mt-6 text-sm">
              Published{" "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(story.publishedAt)}
            </p>
          </header>
          <div className="mt-10">
            <StoryBody node={story.body.root} />
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
