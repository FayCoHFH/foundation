import Link from "next/link";
import type { PublicProject } from "@/modules/communications/projects";
import { StoryBody, type StoryNode } from "@/components/editorial/story-body";
import {
  formattedProjectDate,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/app/admin/projects/project-constants";

export function ProjectStatus({
  status,
}: {
  status: PublicProject["projectStatus"];
}) {
  return <span>{PROJECT_STATUS_LABELS[status]}</span>;
}
export function ProjectFacts({
  facts,
}: {
  facts: PublicProject["impactFacts"];
}) {
  return facts.length ? (
    <dl className="mt-6 grid gap-4 sm:grid-cols-2">
      {facts.map((fact) => (
        <div
          key={`${fact.sortOrder}-${fact.label}`}
          className="border-border border-l-2 pl-4"
        >
          <dt className="text-muted-foreground text-sm">{fact.label}</dt>
          <dd className="mt-1 font-semibold">
            {fact.value}
            {fact.unit ? ` ${fact.unit}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  ) : null;
}
function ProjectMeta({ project }: { project: PublicProject }) {
  return (
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-muted-foreground">Type</dt>
        <dd className="mt-1 font-semibold">
          {PROJECT_TYPE_LABELS[project.projectType]}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="mt-1 font-semibold">
          <ProjectStatus status={project.projectStatus} />
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Community</dt>
        <dd className="mt-1 font-semibold">{project.community}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">County</dt>
        <dd className="mt-1 font-semibold">{project.county}</dd>
      </div>
      {project.publicArea ? (
        <div>
          <dt className="text-muted-foreground">Public area</dt>
          <dd className="mt-1 font-semibold">{project.publicArea}</dd>
        </div>
      ) : null}
      {project.startDate ? (
        <div>
          <dt className="text-muted-foreground">Started</dt>
          <dd className="mt-1 font-semibold">
            {formattedProjectDate(project.startDate)}
          </dd>
        </div>
      ) : null}
      {project.completionDate ? (
        <div>
          <dt className="text-muted-foreground">
            {project.projectStatus === "COMPLETED"
              ? "Completed"
              : "Expected completion"}
          </dt>
          <dd className="mt-1 font-semibold">
            {formattedProjectDate(project.completionDate)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
export function ProjectCard({ project }: { project: PublicProject }) {
  return (
    <li className="border-border border-t py-7">
      <article>
        <p className="text-primary text-sm font-semibold">
          <ProjectStatus status={project.projectStatus} /> ·{" "}
          {PROJECT_TYPE_LABELS[project.projectType]}
        </p>
        <h2 className="mt-2 font-serif text-2xl">
          <Link
            className="decoration-primary/40 underline underline-offset-4"
            href={`/projects/${project.slug}`}
          >
            {project.title}
          </Link>
        </h2>
        <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
          {project.summary}
        </p>
        <p className="mt-3 text-sm">
          {project.community}, {project.county}
        </p>
        <ProjectFacts facts={project.impactFacts.slice(0, 3)} />
      </article>
    </li>
  );
}
export function ProjectDetail({ project }: { project: PublicProject }) {
  return (
    <>
      <p className="text-primary text-sm font-semibold">
        <ProjectStatus status={project.projectStatus} /> ·{" "}
        {PROJECT_TYPE_LABELS[project.projectType]}
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
        {project.title}
      </h1>
      <p className="text-muted-foreground mt-5 max-w-3xl text-xl leading-8">
        {project.summary}
      </p>
      <ProjectMeta project={project} />
      <div className="mt-10 max-w-3xl">
        <StoryBody node={project.body.root as StoryNode} />
      </div>
      <ProjectFacts facts={project.impactFacts} />
      <p className="text-muted-foreground mt-10 border-t pt-5 text-sm">
        Published {formattedProjectDate(project.publishedAt)}
      </p>
    </>
  );
}
