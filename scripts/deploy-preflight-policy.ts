export const habitatDeploymentIdentity = {
  remote: "https://github.com/FayCoHFH/foundation.git",
  githubUser: "FayCoHFH",
  vercelUser: "tech-9723",
  vercelTeamId: "team_rnWDylEaUNN9I5IgOrgRZojc",
  vercelProjectId: "prj_9aYpfojsfQ47zvIo5fKvzsL4I6ZF",
  vercelProjectName: "faycohfh-foundation",
} as const;

export type VercelProjectLink = {
  orgId?: string;
  projectId?: string;
  projectName?: string;
};

type DeploymentPreflightFacts = {
  remote: string;
  githubUser: string;
  vercelUser: string;
  localVercelLink: VercelProjectLink | undefined;
  allowVerifiedHabitatLink: boolean;
};

function requireExact(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${expected}; received ${actual || "<empty>"}`,
    );
  }
}

export function validateDeploymentPreflight(
  facts: DeploymentPreflightFacts,
): void {
  requireExact("Git remote", facts.remote, habitatDeploymentIdentity.remote);
  requireExact(
    "GitHub identity",
    facts.githubUser,
    habitatDeploymentIdentity.githubUser,
  );
  requireExact(
    "Vercel CLI identity",
    facts.vercelUser,
    habitatDeploymentIdentity.vercelUser,
  );

  if (!facts.localVercelLink) return;

  if (!facts.allowVerifiedHabitatLink) {
    throw new Error(
      "Remove local .vercel/project.json before any provider mutation; stale linkage is not permitted.",
    );
  }

  requireExact(
    "Temporary Vercel team linkage",
    facts.localVercelLink.orgId ?? "",
    habitatDeploymentIdentity.vercelTeamId,
  );
  requireExact(
    "Temporary Vercel project linkage",
    facts.localVercelLink.projectId ?? "",
    habitatDeploymentIdentity.vercelProjectId,
  );
  requireExact(
    "Temporary Vercel project name",
    facts.localVercelLink.projectName ?? "",
    habitatDeploymentIdentity.vercelProjectName,
  );
}
