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
      <main id="campaigns-main" className="public-page-main">
        <header className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">Join the work</p>
            <h1 className="public-page-title">Campaigns</h1>
            <p className="public-page-deck">
              Ways our community can rally around a shared purpose, with giving
              and volunteer destinations kept safely with DonorView.
            </p>
          </div>
        </header>
        {campaigns.length ? (
          <div className="public-content-wrap">
            {current.length ? (
              <section
                aria-labelledby="current-campaigns-heading"
                className="public-section-rule"
              >
                <h2
                  id="current-campaigns-heading"
                  className="public-section-heading"
                >
                  Current Campaigns
                </h2>
                <ul className="public-rule-list mt-8">
                  {current.map((campaign) => (
                    <CampaignCard key={campaign.slug} campaign={campaign} />
                  ))}
                </ul>
              </section>
            ) : null}
            {historical.length ? (
              <section
                aria-labelledby="historical-campaigns-heading"
                className="public-section-rule mt-20"
              >
                <h2
                  id="historical-campaigns-heading"
                  className="public-section-heading"
                >
                  Completed and previous Campaigns
                </h2>
                <ul className="public-rule-list mt-8">
                  {historical.map((campaign) => (
                    <CampaignCard key={campaign.slug} campaign={campaign} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="public-content-wrap">
            <p className="border-limestone bg-warm-paper border p-6">
              Campaigns will appear here as they are ready to share.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
