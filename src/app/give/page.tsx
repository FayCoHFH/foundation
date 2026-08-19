import type { Metadata } from "next";
import Link from "next/link";

import {
  PublicHandoff,
  ParticipationLink,
} from "@/components/engagement/public-handoff";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNoticeRegion } from "@/components/site/site-notice-region";
import { SkipLink } from "@/components/ui/skip-link";
import { listCurrentPublicCampaigns } from "@/modules/communications/campaigns";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { prisma } from "@/platform/database/prisma";
import { SiteNoticeTargetArea } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Give",
  description: "Learn how giving supports Fayette County Habitat for Humanity.",
};

export default async function GivePage() {
  const [destination, campaigns] = await Promise.all([
    getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    listCurrentPublicCampaigns(prisma, { limit: 6 }),
  ]);
  const supportingCampaigns = campaigns.filter((campaign) =>
    campaign.actions.some((action) => action.actionType === "DONATE"),
  );

  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="give-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="give-main" className="public-page-main">
        <header className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">A way to help</p>
            <h1 className="public-page-title">
              Give where a safe home begins.
            </h1>
            <p className="public-page-deck">
              Your support helps Fayette County Habitat for Humanity build and
              repair homes with local families and neighbors.
            </p>
          </div>
        </header>
        <div className="public-content-wrap">
          <section
            aria-labelledby="give-next-step"
            className="public-section-rule"
          >
            <h2 id="give-next-step" className="public-section-heading">
              Make a general gift
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
              General giving supports Habitat’s work across Fayette County. The
              secure donation page is hosted and managed by DonorView.
            </p>
            <div className="mt-7">
              <PublicHandoff destination={destination} action="Donate" />
            </div>
          </section>
          <section
            aria-labelledby="campaign-giving"
            className="public-section-rule mt-20"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="public-kicker">Campaigns</p>
                <h2
                  id="campaign-giving"
                  className="public-section-heading mt-3"
                >
                  Support a specific effort
                </h2>
              </div>
              <ParticipationLink href="/campaigns">
                Explore all Campaigns
              </ParticipationLink>
            </div>
            {supportingCampaigns.length ? (
              <ul className="public-rule-list mt-8 max-w-5xl">
                {supportingCampaigns.map((campaign) => (
                  <li key={campaign.slug} className="py-5">
                    <Link
                      className="text-charcoal decoration-habitat-blue/40 hover:text-habitat-blue font-serif text-2xl font-semibold underline underline-offset-4"
                      href={`/campaigns/${campaign.slug}`}
                    >
                      {campaign.title}
                    </Link>
                    <p className="text-muted-foreground mt-2 max-w-2xl leading-7">
                      {campaign.summary}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-limestone bg-pale-habitat-blue mt-8 max-w-2xl border p-6">
                Campaign-specific giving opportunities will appear here when
                they are ready to share.
              </p>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
