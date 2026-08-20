import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const expectedRemote = "https://github.com/FayCoHFH/foundation.git";
const expectedGitHubUser = "FayCoHFH";
const expectedVercelUser = "tech-9723";
const expectedVercelTeamId = "team_rnWDylEaUNN9I5IgOrgRZojc";
const expectedVercelProjectName = "faycohfh-foundation";

function command(file: string, args: string[]): string {
  try {
    return execFileSync(file, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${file} ${args.join(" ")} failed: ${detail}`);
  }
}

function requireExact(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${expected}; received ${actual || "<empty>"}`,
    );
  }
}

try {
  requireExact(
    "Git remote",
    command("git", ["remote", "get-url", "origin"]),
    expectedRemote,
  );
  requireExact(
    "GitHub identity",
    command("gh", ["api", "user", "--jq", ".login"]),
    expectedGitHubUser,
  );
  requireExact(
    "Vercel CLI identity",
    command("vercel", ["whoami"]),
    expectedVercelUser,
  );

  const localVercelLink = resolve(process.cwd(), ".vercel", "project.json");
  if (existsSync(localVercelLink)) {
    if (process.env.ALLOW_VERIFIED_HABITAT_LINK !== "true") {
      throw new Error(
        "Remove local .vercel/project.json before any provider mutation; stale linkage is not permitted.",
      );
    }

    const linkage = JSON.parse(readFileSync(localVercelLink, "utf8")) as {
      orgId?: string;
      projectName?: string;
    };
    requireExact(
      "Temporary Vercel team linkage",
      linkage.orgId ?? "",
      expectedVercelTeamId,
    );
    requireExact(
      "Temporary Vercel project linkage",
      linkage.projectName ?? "",
      expectedVercelProjectName,
    );
    console.log(
      "Temporary Habitat Vercel linkage verified for the explicitly scoped connection step.",
    );
  }

  console.log(
    "Deployment preflight passed: GitHub, Vercel, remote, and local linkage guards are satisfied.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
