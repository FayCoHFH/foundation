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
      <main id="projects-main" className="public-page-main">
        <header className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">Our work</p>
            <h1 className="public-page-title">Projects</h1>
            <p className="public-page-deck">
              Building and repairing homes across Fayette County.
            </p>
          </div>
        </header>
        {projects.length ? (
          <div className="public-content-wrap">
            {current.length ? (
              <section
                aria-labelledby="current-projects-heading"
                className="public-section-rule"
              >
                <h2
                  id="current-projects-heading"
                  className="public-section-heading"
                >
                  Current Projects
                </h2>
                <ul className="public-rule-list mt-8">
                  {current.map((project) => (
                    <ProjectCard key={project.slug} project={project} />
                  ))}
                </ul>
              </section>
            ) : null}
            {historical.length ? (
              <section
                aria-labelledby="previous-projects-heading"
                className="public-section-rule mt-20"
              >
                <h2
                  id="previous-projects-heading"
                  className="public-section-heading"
                >
                  Completed and previous projects
                </h2>
                <ul className="public-rule-list mt-8">
                  {historical.map((project) => (
                    <ProjectCard key={project.slug} project={project} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="public-content-wrap">
            <p className="border-limestone bg-pale-habitat-blue border p-6">
              Project updates will appear here as they are ready to share.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
