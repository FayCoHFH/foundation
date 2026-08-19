import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/projects/project-presentation";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicProjectBySlug } from "@/modules/communications/projects";
import { getCanonicalUrl } from "@/platform/config/discoverability";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(prisma, slug);
  const canonical = project
    ? getCanonicalUrl(`/projects/${project.slug}`)
    : undefined;
  return project
    ? {
        title: project.title,
        description: project.summary,
        ...(canonical ? { alternates: { canonical } } : {}),
      }
    : { title: "Project not found" };
}
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(prisma, slug);
  if (!project) notFound();
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="project-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="project-main" className="public-content-wrap">
        <ProjectDetail project={project} />
      </main>
      <SiteFooter />
    </div>
  );
}
