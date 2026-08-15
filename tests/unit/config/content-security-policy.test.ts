import { afterEach, describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "../../../next.config";

const originalAppEnv = process.env.APP_ENV;
const originalNodeEnv = process.env.NODE_ENV;
const environment = process.env as Record<string, string | undefined>;

function cspFor(appEnv: string, nodeEnv: string) {
  environment.APP_ENV = appEnv;
  environment.NODE_ENV = nodeEnv;
  return buildContentSecurityPolicy();
}

afterEach(() => {
  if (originalAppEnv === undefined) delete environment.APP_ENV;
  else environment.APP_ENV = originalAppEnv;
  if (originalNodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = originalNodeEnv;
});

describe("Content-Security-Policy script sources", () => {
  it("includes unsafe-eval for the development runtime", () => {
    expect(cspFor("development", "development")).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
  });

  it("excludes unsafe-eval for the production runtime", () => {
    expect(cspFor("production", "production")).not.toContain("'unsafe-eval'");
  });

  it("uses NODE_ENV for APP_ENV=test development tooling", () => {
    expect(cspFor("test", "development")).toContain("'unsafe-eval'");
  });

  it("keeps APP_ENV=test with a production runtime strict", () => {
    expect(cspFor("test", "production")).not.toContain("'unsafe-eval'");
  });

  it("does not change the other CSP directives", () => {
    const development = cspFor("test", "development");
    const production = cspFor("test", "production");
    const withoutScriptSource = (policy: string) =>
      policy
        .split("; ")
        .filter((directive) => !directive.startsWith("script-src "))
        .join("; ");

    expect(withoutScriptSource(development)).toBe(
      withoutScriptSource(production),
    );
  });
});
