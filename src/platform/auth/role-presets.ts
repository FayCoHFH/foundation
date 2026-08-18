import { CAPABILITIES, type Capability } from "@/platform/auth/capabilities";

const communicationsCapabilities = CAPABILITIES.filter(
  (capability) =>
    capability.startsWith("communications.") ||
    capability.startsWith("stories.") ||
    capability.startsWith("news.") ||
    capability.startsWith("projects.") ||
    capability.startsWith("campaigns.") ||
    capability.startsWith("newsletter.") ||
    capability.startsWith("media.") ||
    capability === "integrations.donorview.read" ||
    capability === "integrations.donorview.configure",
);

const futureSensitiveCapabilities = new Set<Capability>([
  "grants.private.read",
  "grants.private.manage",
  "grants.private.documents.manage",
  "grants.private.export",
  "applicants.read",
  "applicants.manage",
  "applicants.documents.read",
  "applicants.documents.manage",
  "applicants.notes.manage",
  "applicants.export",
]);

export type RolePreset = {
  key: string;
  name: string;
  description: string;
  capabilities: readonly Capability[];
};

export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    key: "contributor",
    name: "Contributor",
    description: "Creates and submits owned Story and News drafts.",
    capabilities: [
      "communications.queue.read",
      "stories.create",
      "stories.read.draft.own",
      "stories.edit.own",
      "stories.submit",
      "news.create",
      "news.read.draft.own",
      "news.edit.own",
      "news.submit",
      "projects.create",
      "projects.read.draft.own",
      "projects.edit.own",
      "projects.submit_review",
      "campaigns.create",
      "campaigns.read.draft.own",
      "campaigns.edit.own",
      "campaigns.submit_review",
      "integrations.donorview.read",
      "media.upload",
    ],
  },
  {
    key: "editor",
    name: "Editor",
    description: "Reviews and edits Communications work without publishing it.",
    capabilities: [
      "communications.dashboard.read",
      "communications.queue.read",
      "communications.calendar.read",
      "stories.read.draft.any",
      "stories.edit.any",
      "stories.review",
      "news.read.draft.any",
      "news.edit.any",
      "news.review",
      "projects.read.draft.any",
      "projects.edit.any",
      "projects.review",
      "campaigns.read.draft.any",
      "campaigns.edit.any",
      "campaigns.review",
      "integrations.donorview.read",
      "newsletter.read.draft",
      "newsletter.edit",
      "newsletter.review",
      "media.upload",
      "media.edit",
      "communications.categories.manage",
      "communications.authors.manage",
    ],
  },
  {
    key: "publisher",
    name: "Publisher",
    description:
      "Schedules and releases exact approved Communications snapshots.",
    capabilities: [
      "communications.dashboard.read",
      "communications.queue.read",
      "communications.calendar.read",
      "communications.placements.manage",
      "communications.notices.manage",
      "stories.schedule",
      "stories.publish",
      "stories.withdraw",
      "stories.archive",
      "news.schedule",
      "news.publish",
      "news.withdraw",
      "news.archive",
      "projects.release",
      "projects.withdraw",
      "projects.archive",
      "campaigns.release",
      "campaigns.withdraw",
      "campaigns.archive",
      "newsletter.schedule",
      "newsletter.publish",
      "newsletter.withdraw",
      "newsletter.archive",
    ],
  },
  {
    key: "communications-manager",
    name: "Communications Manager",
    description:
      "Coordinates Communications work with separation-of-duties checks.",
    capabilities: communicationsCapabilities.filter(
      (capability) =>
        capability !== "communications.requirements.override" &&
        capability !== "communications.submissions.restore_spam" &&
        capability !== "communications.media.restore_eligibility",
    ),
  },
  {
    key: "platform-admin",
    name: "Platform Admin",
    description: "Administers users and current platform configuration.",
    capabilities: [
      "users.read",
      "users.invite",
      "users.activate",
      "users.roles.assign",
      "users.suspend",
      "users.restore",
      "permissions.manage",
      "integrations.read",
      "integrations.configure",
      "audit.read",
      "settings.manage",
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Reads audit evidence without mutation capabilities.",
    capabilities: ["audit.read"],
  },
  {
    key: "super-admin",
    name: "Super Admin",
    description:
      "Controlled current-platform administration and fresh-auth override policy.",
    capabilities: CAPABILITIES.filter(
      (capability) => !futureSensitiveCapabilities.has(capability),
    ),
  },
] as const;
