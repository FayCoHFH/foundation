import { getEffectiveSiteNotices } from "@/modules/communications/notices";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";
import { prisma } from "@/platform/database/prisma";

import { SiteNoticeContent } from "./site-notice";

export async function SiteNoticeRegion({
  targetArea,
}: {
  targetArea: SiteNoticeTargetArea;
}) {
  const notices = await getEffectiveSiteNotices(prisma, targetArea, {
    evaluationTime: new Date(),
  });
  return <SiteNoticeContent targetArea={targetArea} notices={notices} />;
}
