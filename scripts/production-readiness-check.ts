import { readFileSync } from "node:fs";
import path from "node:path";

import { getDiscoverabilityPolicy } from "../src/platform/config/discoverability";

type ReadinessCheck = {
  id: string;
  status: "PASS" | "BLOCKED";
  detail: string;
};

const root = process.cwd();
const policy = getDiscoverabilityPolicy();
const referenceManifest = JSON.parse(
  readFileSync(path.join(root, "public/reference/manifest.json"), "utf8"),
) as { productionUse?: boolean };

const checks: ReadinessCheck[] = [
  {
    id: "production-environment",
    status: policy.isExplicitProduction ? "PASS" : "BLOCKED",
    detail: policy.isExplicitProduction
      ? "APP_ENV is explicitly production."
      : "APP_ENV is not explicitly production.",
  },
  {
    id: "production-indexing-decision",
    status: policy.indexingEnabled ? "PASS" : "BLOCKED",
    detail: policy.indexingEnabled
      ? "Production indexing is explicitly enabled."
      : "Indexing remains disabled until the production release owner explicitly approves and updates the policy.",
  },
  {
    id: "production-canonical-origin",
    status: policy.canonicalOrigin ? "PASS" : "BLOCKED",
    detail: policy.canonicalOrigin
      ? `Canonical origin: ${policy.canonicalOrigin}`
      : "An exact HTTPS production canonical origin is not configured.",
  },
  {
    id: "temporary-reference-image",
    status: referenceManifest.productionUse === false ? "BLOCKED" : "PASS",
    detail:
      "The temporary Portland reference image must be replaced and rights/provenance approved before production.",
  },
  {
    id: "restore-readiness",
    status: "BLOCKED",
    detail:
      "ReStore operational details and applicable ReStore guidance remain verification-required.",
  },
  {
    id: "preview-protection",
    status: "BLOCKED",
    detail:
      "Vercel Preview Deployment Protection must be enabled before preview review.",
  },
];

const blocked = checks.filter((check) => check.status === "BLOCKED");
console.log(
  JSON.stringify(
    {
      environment: policy.environment,
      indexing: {
        enabled: policy.indexingEnabled,
        robots: policy.robots,
        xRobotsTag: policy.xRobotsTag,
      },
      checks,
      blockedCount: blocked.length,
    },
    null,
    2,
  ),
);

if (blocked.length > 0) process.exitCode = 1;
