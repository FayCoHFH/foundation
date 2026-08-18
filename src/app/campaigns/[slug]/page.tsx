import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDetail } from "@/components/campaigns/campaign-presentation";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicCampaignBySlug } from "@/modules/communications/campaigns";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getPublicCampaignBySlug(prisma, slug);
  return campaign
    ? {
        title: campaign.title,
        description: campaign.summary,
        alternates: { canonical: `/campaigns/${campaign.slug}` },
      }
    : { title: "Campaign not found" };
}

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const campaign = await getPublicCampaignBySlug(prisma, slug);
  if (!campaign) notFound();
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="campaign-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main
        id="campaign-main"
        className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20"
      >
        <p className="mb-8 text-sm">
          <Link className="underline underline-offset-4" href="/campaigns">
            ← All Campaigns
          </Link>
        </p>
        <CampaignDetail campaign={campaign} />
      </main>
      <SiteFooter />
    </div>
  );
}
