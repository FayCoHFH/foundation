import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { CampaignCard } from "@/components/campaigns/campaign-presentation";
import {
  listCurrentPublicCampaigns,
  listHistoricalPublicCampaigns,
} from "@/modules/communications/campaigns";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Campaigns",
  description:
    "Campaigns and initiatives from Fayette County Habitat for Humanity.",
};

export default async function CampaignsPage() {
  const [current, historical] = await Promise.all([
    listCurrentPublicCampaigns(prisma, { limit: 100 }),
    listHistoricalPublicCampaigns(prisma, { limit: 100 }),
  ]);
  const campaigns = [...current, ...historical];
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="campaigns-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main
        id="campaigns-main"
        className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20"
      >
        <p className="text-primary text-sm font-semibold">Join the work</p>
        <h1 className="mt-3 font-serif text-5xl leading-tight">Campaigns</h1>
        <p className="text-muted-foreground mt-5 max-w-2xl text-xl leading-8">
          Ways our community can rally around a shared purpose, with giving and
          volunteer destinations kept safely with DonorView.
        </p>
        {campaigns.length ? (
          <div className="mt-12 max-w-4xl">
            {current.length ? (
              <section aria-labelledby="current-campaigns-heading">
                <h2
                  id="current-campaigns-heading"
                  className="font-serif text-3xl"
                >
                  Current Campaigns
                </h2>
                <ul className="mt-3">
                  {current.map((campaign) => (
                    <CampaignCard key={campaign.slug} campaign={campaign} />
                  ))}
                </ul>
              </section>
            ) : null}
            {historical.length ? (
              <section
                aria-labelledby="historical-campaigns-heading"
                className="mt-14"
              >
                <h2
                  id="historical-campaigns-heading"
                  className="font-serif text-3xl"
                >
                  Completed and previous Campaigns
                </h2>
                <ul className="mt-3">
                  {historical.map((campaign) => (
                    <CampaignCard key={campaign.slug} campaign={campaign} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="border-border mt-10 max-w-2xl border p-6">
            Campaigns will appear here as they are ready to share.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
