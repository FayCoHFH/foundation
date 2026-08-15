import type { MetadataRoute } from "next";

// The Slice 1 foundation is intentionally not a production-content release.
// Replace this only when the public launch and canonical-domain gates close.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
