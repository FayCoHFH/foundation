import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  approveProject,
  createProject,
  releaseProject,
  sendProjectForApproval,
  submitProject,
} from "../src/modules/communications/projects";
import {
  legacyProjectSlug,
  MIGRATED_PROJECT_HISTORY_RECORDS,
  projectCandidateFromLegacyRecord,
} from "../src/modules/content/legacy-project-history";
import {
  isCapability,
  type Capability,
} from "../src/platform/auth/capabilities";
import { loadEnvironmentFiles } from "../src/platform/config/load-environment-files";

loadEnvironmentFiles();

const connectionString =
  process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
const authorAdminUserId = process.env.CONTENT_SEED_AUTHOR_ADMIN_USER_ID;
const approverAdminUserId = process.env.CONTENT_SEED_APPROVER_ADMIN_USER_ID;

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required.");
}
if (!authorAdminUserId || !approverAdminUserId) {
  throw new Error(
    "Set CONTENT_SEED_AUTHOR_ADMIN_USER_ID and CONTENT_SEED_APPROVER_ADMIN_USER_ID to two active, distinct admin users. The content seed never creates or grants admin access.",
  );
}
if (authorAdminUserId === approverAdminUserId) {
  throw new Error(
    "Content seeding requires distinct author and approver admin users.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type SeedActor = {
  adminUserId: string;
  capabilities: readonly Capability[];
};

async function loadActor(adminUserId: string): Promise<SeedActor> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    include: {
      roleAssignments: {
        where: { revokedAt: null, role: { isActive: true } },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!admin || admin.status !== "ACTIVE") {
    throw new Error(`Admin user ${adminUserId} is not active.`);
  }
  const capabilities = [
    ...new Set(
      admin.roleAssignments.flatMap((assignment) =>
        assignment.role.permissions
          .map(({ permission }) => permission.key)
          .filter(isCapability),
      ),
    ),
  ];
  return { adminUserId, capabilities };
}

function requireCapabilities(
  actor: SeedActor,
  required: readonly Capability[],
  label: string,
) {
  const missing = required.filter(
    (capability) => !actor.capabilities.includes(capability),
  );
  if (missing.length) {
    throw new Error(`${label} is missing: ${missing.join(", ")}.`);
  }
}

async function seed() {
  const author = await loadActor(authorAdminUserId!);
  const approver = await loadActor(approverAdminUserId!);
  requireCapabilities(
    author,
    ["projects.create", "projects.submit_review"],
    "Content seed author",
  );
  requireCapabilities(
    approver,
    ["projects.review", "projects.approve", "projects.release"],
    "Content seed approver",
  );

  let created = 0;
  let skipped = 0;
  for (const record of MIGRATED_PROJECT_HISTORY_RECORDS) {
    const slug = legacyProjectSlug(record);
    const existing = await prisma.publication.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      console.log(`Skipped existing legacy Project ${record.id}.`);
      continue;
    }

    const draft = await createProject(
      prisma,
      author,
      projectCandidateFromLegacyRecord(record),
    );
    const submitted = await submitProject(prisma, author, {
      projectId: draft.projectId,
      expectedVersion: draft.version,
      expectedContentHash: draft.currentRevision.contentHash,
    });
    const pendingApproval = await sendProjectForApproval(prisma, approver, {
      projectId: submitted.projectId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveProject(prisma, approver, {
      projectId: pendingApproval.projectId,
      expectedVersion: pendingApproval.version,
      expectedContentHash: pendingApproval.currentRevision.contentHash,
    });
    await releaseProject(prisma, approver, {
      projectId: approved.projectId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug,
    });
    created += 1;
    console.log(`Seeded historical Project ${record.id} at /projects/${slug}.`);
  }

  console.log(
    JSON.stringify(
      {
        source: "legacy-wix-project-history",
        selected: MIGRATED_PROJECT_HISTORY_RECORDS.length,
        created,
        skipped,
      },
      null,
      2,
    ),
  );
}

seed()
  .catch(() => {
    console.error("Historical Project content seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
