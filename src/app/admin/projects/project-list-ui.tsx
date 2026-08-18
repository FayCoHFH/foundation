"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectAdminListItem } from "@/modules/communications/projects";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "./project-constants";

export function ProjectListUI({
  projects,
}: {
  projects: readonly ProjectAdminListItem[];
}) {
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [state, setState] = useState("ALL");
  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (type === "ALL" || p.projectType === type) &&
          (status === "ALL" || p.projectStatus === status) &&
          (state === "ALL" || p.workflow === state),
      ),
    [projects, type, status, state],
  );
  return (
    <>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <label>
          <span className="font-semibold">Type</span>
          <select
            aria-label="Filter by Project type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All types</option>
            {Object.entries(PROJECT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Project status</span>
          <select
            aria-label="Filter by Project status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Editorial workflow</span>
          <select
            aria-label="Filter by editorial workflow"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All workflow states</option>
            {[
              "DRAFT",
              "CHANGES_REQUESTED",
              "IN_REVIEW",
              "PENDING_APPROVAL",
              "APPROVED",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        Showing {filtered.length} of {projects.length} Projects.
      </p>
      {filtered.length ? (
        <div className="border-border mt-4 overflow-x-auto border">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">Project drafts</caption>
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Workflow / release</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.projectId} className="border-border border-t">
                  <td className="px-4 py-4">
                    <Link
                      className="font-semibold underline"
                      href={`/admin/projects/${project.projectId}`}
                    >
                      {project.title}
                    </Link>
                    {project.hasSuccessorDraft ? (
                      <span className="text-muted-foreground mt-1 block text-xs">
                        Successor draft; public release remains unchanged
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {PROJECT_TYPE_LABELS[project.projectType]}
                    <br />
                    {PROJECT_STATUS_LABELS[project.projectStatus]}
                  </td>
                  <td className="px-4 py-4">
                    {project.workflow.replaceAll("_", " ")}
                    <br />
                    {project.releaseState.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-4">
                    {project.community}, {project.county}
                  </td>
                  <td className="px-4 py-4">
                    {project.updatedAt.toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-border mt-4 border p-6">
          No Project drafts match these filters.
        </p>
      )}
    </>
  );
}
