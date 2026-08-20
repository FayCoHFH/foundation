import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  type VercelProjectLink,
  validateDeploymentPreflight,
} from "./deploy-preflight-policy";

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

try {
  const localVercelLink = resolve(process.cwd(), ".vercel", "project.json");
  const linkage = existsSync(localVercelLink)
    ? (JSON.parse(readFileSync(localVercelLink, "utf8")) as VercelProjectLink)
    : undefined;

  validateDeploymentPreflight({
    remote: command("git", ["remote", "get-url", "origin"]),
    githubUser: command("gh", ["api", "user", "--jq", ".login"]),
    vercelUser: command("vercel", ["whoami"]),
    localVercelLink: linkage,
    allowVerifiedHabitatLink:
      process.env.ALLOW_VERIFIED_HABITAT_LINK === "true",
  });

  if (linkage) {
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
