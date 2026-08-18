import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { listPublicProjects } from "@/modules/communications/projects";
import { prisma } from "@/platform/database/prisma";
import { projectStatusGroup } from "@/app/admin/projects/project-constants";
import { ProjectCard } from "@/components/projects/project-presentation";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";
export const metadata: Metadata = {
  title: "Projects",
  description: "Projects by Fayette County Habitat for Humanity.",
};
export default async function ProjectsPage() {
  const projects = await listPublicProjects(prisma, { limit: 100 });
  const current = projects.filter(
    (project) => projectStatusGroup(project.projectStatus) === "CURRENT",
  );
  const historical = projects.filter(
    (project) => projectStatusGroup(project.projectStatus) === "HISTORICAL",
  );
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="projects-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main
        id="projects-main"
        className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20"
      >
        <p className="text-primary text-sm font-semibold">Our work</p>
        <h1 className="mt-3 font-serif text-5xl leading-tight">Projects</h1>
        <p className="text-muted-foreground mt-5 max-w-2xl text-xl leading-8">
          Building and repairing homes across Fayette County.
        </p>
        {projects.length ? (
          <div className="mt-12 max-w-4xl">
            {current.length ? (
              <section aria-labelledby="current-projects-heading">
                <h2
                  id="current-projects-heading"
                  className="font-serif text-3xl"
                >
                  Current Projects
                </h2>
                <ul className="mt-3">
                  {current.map((project) => (
                    <ProjectCard key={project.slug} project={project} />
                  ))}
                </ul>
              </section>
            ) : null}
            {historical.length ? (
              <section
                aria-labelledby="previous-projects-heading"
                className="mt-14"
              >
                <h2
                  id="previous-projects-heading"
                  className="font-serif text-3xl"
                >
                  Completed and previous projects
                </h2>
                <ul className="mt-3">
                  {historical.map((project) => (
                    <ProjectCard key={project.slug} project={project} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="border-border mt-10 max-w-2xl border p-6">
            Project updates will appear here as they are ready to share.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
