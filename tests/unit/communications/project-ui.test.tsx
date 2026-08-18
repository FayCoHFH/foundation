import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectFields } from "@/app/admin/projects/project-form";
import { ProjectListUI } from "@/app/admin/projects/project-list-ui";
import { ProjectDetail } from "@/components/projects/project-presentation";
import type {
  ProjectAdminListItem,
  PublicProject,
} from "@/modules/communications/projects";

const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "A public project update." }],
      },
    ],
  },
} as PublicProject["body"];
const project: PublicProject = {
  slug: "east-side-home",
  title: "East Side Home",
  summary: "A safe, accessible home for a Fayette County family.",
  projectType: "NEW_HOME",
  projectStatus: "IN_PROGRESS",
  community: "Lexington",
  county: "Fayette County",
  publicArea: "East Lexington",
  startDate: new Date("2026-01-01T00:00:00Z"),
  completionDate: null,
  body,
  impactFacts: [{ label: "Homes", value: "1", unit: null, sortOrder: 0 }],
  publishedAt: new Date("2026-02-01T00:00:00Z"),
};
const adminItem: ProjectAdminListItem = {
  projectId: "11111111-1111-4111-8111-111111111111",
  publicationId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  workflow: "DRAFT",
  releaseState: "UNPUBLISHED",
  discoveryDisposition: "ACTIVE",
  slug: null,
  editorialOwnerAdminUserId: "owner",
  title: "Draft Project",
  projectType: "HOME_REPAIR",
  projectStatus: "PLANNED",
  community: "Lexington",
  county: "Fayette County",
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  hasSuccessorDraft: false,
};

describe("Projects UI", () => {
  it("keeps the editor bounded and provides accessible fact ordering", () => {
    const html = renderToStaticMarkup(
      <ProjectFields
        state={{
          status: "idle",
          values: {
            title: "",
            summary: "",
            projectType: "NEW_HOME",
            projectStatus: "PLANNED",
            community: "",
            county: "Fayette County",
            publicArea: "",
            startDate: "",
            completionDate: "",
            body: "",
            impactFacts: [
              { label: "Homes", value: "1", unit: null, sortOrder: 0 },
            ],
          },
        }}
        action={() => undefined}
        pending={false}
        submitLabel="Create Project draft"
      />,
    );
    expect(html).toContain("Do not enter a homeowner’s private street address");
    expect(html).toContain("Move fact earlier");
    expect(html).toContain("Move fact later");
    expect(html).not.toContain("private street address input");
  });

  it("renders body-light admin list information", () => {
    const html = renderToStaticMarkup(<ProjectListUI projects={[adminItem]} />);
    expect(html).toContain("Draft Project");
    expect(html).toContain("Editorial workflow");
    expect(html).not.toContain("contentHash");
  });

  it("renders projection-only public detail fields", () => {
    const html = renderToStaticMarkup(<ProjectDetail project={project} />);
    expect(html).toContain("East Side Home");
    expect(html).toContain("East Lexington");
    expect(html).toContain("A public project update.");
    expect(html).not.toContain("editorialOwnerAdminUserId");
    expect(html).not.toContain("revision");
  });
});
