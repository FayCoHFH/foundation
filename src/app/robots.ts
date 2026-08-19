import type { MetadataRoute } from "next";

import { getDiscoverabilityPolicy } from "@/platform/config/discoverability";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: getDiscoverabilityPolicy().robotsTxt,
  };
}
