import { afterEach, describe, expect, it } from "vitest";

import {
  getCanonicalUrl,
  getDiscoverabilityPolicy,
} from "@/platform/config/discoverability";
import { buildSecurityHeaders } from "../../../next.config";

const originalAppEnv = process.env.APP_ENV;
const originalAppBaseUrl = process.env.APP_BASE_URL;

afterEach(() => {
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
  if (originalAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalAppBaseUrl;
});

describe("discoverability policy", () => {
  it.each([undefined, "development", "test", "preview", "staging"])(
    "fails closed for APP_ENV=%s",
    (appEnv) => {
      const policy = getDiscoverabilityPolicy({
        APP_ENV: appEnv,
        APP_BASE_URL: "https://preview.example.org",
      });

      expect(policy.environment).toBe("nonproduction");
      expect(policy.indexingEnabled).toBe(false);
      expect(policy.robots.index).toBe(false);
      expect(policy.robots.follow).toBe(false);
      expect(policy.xRobotsTag).toBe("noindex, nofollow");
      expect(policy.robotsTxt.disallow).toBe("/");
      expect(policy.canonicalOrigin).toBeUndefined();
      expect(
        getCanonicalUrl("/news/example", {
          APP_ENV: appEnv,
          APP_BASE_URL: "https://preview.example.org",
        }),
      ).toBeUndefined();
    },
  );

  it("recognizes only explicit production and uses its exact HTTPS origin", () => {
    const policy = getDiscoverabilityPolicy({
      APP_ENV: "production",
      APP_BASE_URL: "https://www.fchfh.org/",
    });

    expect(policy.environment).toBe("production");
    expect(policy.isExplicitProduction).toBe(true);
    expect(policy.indexingEnabled).toBe(false);
    expect(policy.canonicalOrigin).toBe("https://www.fchfh.org");
    expect(
      getCanonicalUrl("/news/example", {
        APP_ENV: "production",
        APP_BASE_URL: "https://www.fchfh.org/",
      }),
    ).toBe("https://www.fchfh.org/news/example");
  });

  it("omits a production canonical when its origin is missing or malformed", () => {
    for (const APP_BASE_URL of [undefined, "https://www.fchfh.org/path"]) {
      expect(
        getDiscoverabilityPolicy({ APP_ENV: "production", APP_BASE_URL })
          .canonicalOrigin,
      ).toBeUndefined();
    }
  });

  it("configures the crawler response header from the same policy", () => {
    process.env.APP_ENV = "test";
    process.env.APP_BASE_URL = "http://127.0.0.1:3100";
    expect(buildSecurityHeaders()).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow",
    });
  });
});
