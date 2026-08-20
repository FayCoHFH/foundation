import { describe, expect, it } from "vitest";

import {
  habitatDeploymentIdentity,
  validateDeploymentPreflight,
} from "../../scripts/deploy-preflight-policy";

const validFacts = {
  remote: habitatDeploymentIdentity.remote,
  githubUser: habitatDeploymentIdentity.githubUser,
  vercelUser: habitatDeploymentIdentity.vercelUser,
  localVercelLink: undefined,
  allowVerifiedHabitatLink: false,
};

describe("deployment identity preflight", () => {
  it("accepts the Habitat identities with no local Vercel linkage", () => {
    expect(() => validateDeploymentPreflight(validFacts)).not.toThrow();
  });

  it.each([
    ["remote", "https://github.com/example/foundation.git", /Git remote/],
    ["githubUser", "personal-user", /GitHub identity/],
    ["vercelUser", "personal-user", /Vercel CLI identity/],
  ] as const)("fails closed for a wrong %s", (field, value, message) => {
    expect(() =>
      validateDeploymentPreflight({ ...validFacts, [field]: value }),
    ).toThrow(message);
  });

  it("rejects even the correct local link without the explicit temporary exception", () => {
    expect(() =>
      validateDeploymentPreflight({
        ...validFacts,
        localVercelLink: {
          orgId: habitatDeploymentIdentity.vercelTeamId,
          projectId: habitatDeploymentIdentity.vercelProjectId,
          projectName: habitatDeploymentIdentity.vercelProjectName,
        },
      }),
    ).toThrow(/stale linkage is not permitted/);
  });

  it.each([
    ["orgId", "personal-team", /team linkage/],
    ["projectId", "personal-project", /project linkage/],
    ["projectName", "personal-foundation", /project name/],
  ] as const)(
    "rejects an allowed link with a wrong %s",
    (field, value, message) => {
      expect(() =>
        validateDeploymentPreflight({
          ...validFacts,
          allowVerifiedHabitatLink: true,
          localVercelLink: {
            orgId: habitatDeploymentIdentity.vercelTeamId,
            projectId: habitatDeploymentIdentity.vercelProjectId,
            projectName: habitatDeploymentIdentity.vercelProjectName,
            [field]: value,
          },
        }),
      ).toThrow(message);
    },
  );

  it("accepts only the exact Habitat link during the explicit temporary exception", () => {
    expect(() =>
      validateDeploymentPreflight({
        ...validFacts,
        allowVerifiedHabitatLink: true,
        localVercelLink: {
          orgId: habitatDeploymentIdentity.vercelTeamId,
          projectId: habitatDeploymentIdentity.vercelProjectId,
          projectName: habitatDeploymentIdentity.vercelProjectName,
        },
      }),
    ).not.toThrow();
  });
});
