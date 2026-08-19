export type DiscoverabilitySource = {
  [key: string]: string | undefined;
  APP_ENV?: string | undefined;
  APP_BASE_URL?: string | undefined;
};

const nonIndexingRobots = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    "max-video-preview": -1,
    "max-image-preview": "none" as const,
    "max-snippet": -1,
  },
} as const;

function explicitProductionOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const normalizedInput = value.trim().replace(/\/$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      normalizedInput !== url.origin
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getDiscoverabilityPolicy(
  source: DiscoverabilitySource = process.env,
) {
  const isExplicitProduction = source.APP_ENV === "production";

  return {
    environment: isExplicitProduction
      ? ("production" as const)
      : ("nonproduction" as const),
    isExplicitProduction,
    indexingEnabled: false,
    robots: nonIndexingRobots,
    xRobotsTag: "noindex, nofollow",
    robotsTxt: {
      userAgent: "*",
      disallow: "/",
    },
    canonicalOrigin: isExplicitProduction
      ? explicitProductionOrigin(source.APP_BASE_URL)
      : undefined,
    sitemap: "not-published" as const,
  } as const;
}

export function getCanonicalUrl(
  pathname: string,
  source: DiscoverabilitySource = process.env,
) {
  const origin = getDiscoverabilityPolicy(source).canonicalOrigin;
  return origin ? new URL(pathname, origin).toString() : undefined;
}
