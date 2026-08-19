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
  title: "Volunteer",
  description:
    "Find ways to volunteer with Fayette County Habitat for Humanity.",
};

export default async function VolunteerPage() {
  const [destination, campaigns] = await Promise.all([
    getPublicGlobalDestination(prisma, "GENERAL_VOLUNTEER"),
    listCurrentPublicCampaigns(prisma, { limit: 6 }),
  ]);
  const volunteerCampaigns = campaigns.filter((campaign) =>
    campaign.actions.some((action) => action.actionType === "VOLUNTEER"),
  );

  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="volunteer-main" />
      <SiteHeader />
      <SiteNoticeRegion targetArea={SiteNoticeTargetArea.SITE_WIDE} />
      <main id="volunteer-main" className="public-page-main">
        <header className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">A way to help</p>
            <h1 className="public-page-title">Bring your time to the work.</h1>
            <p className="public-page-deck">
              From build days to community support, volunteers help make
              Habitat’s work possible across Fayette County.
            </p>
          </div>
        </header>
        <div className="public-content-wrap">
          <section
            aria-labelledby="volunteer-next-step"
            className="public-section-rule"
          >
            <h2 id="volunteer-next-step" className="public-section-heading">
              Start with general volunteer interest
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
              Tell Habitat you would like to help. Volunteer applications and
              registration continue securely through DonorView.
            </p>
            <div className="mt-7">
              <PublicHandoff destination={destination} action="Volunteer" />
            </div>
          </section>
          <section
            aria-labelledby="volunteer-campaigns"
            className="public-section-rule mt-20"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="public-kicker">Campaigns</p>
                <h2
                  id="volunteer-campaigns"
                  className="public-section-heading mt-3"
                >
                  Join a specific workday
                </h2>
              </div>
              <ParticipationLink href="/campaigns">
                Explore all Campaigns
              </ParticipationLink>
            </div>
            {volunteerCampaigns.length ? (
              <ul className="public-rule-list mt-8 max-w-5xl">
                {volunteerCampaigns.map((campaign) => (
                  <li key={campaign.slug} className="py-5">
                    <Link
                      className="text-brand-black decoration-brand-bright-blue hover:text-brand-traditional-blue type-display text-2xl font-semibold underline underline-offset-4"
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
              <p className="border-brand-cool-gray bg-surface-subtle mt-8 max-w-2xl border p-6">
                Campaign-specific volunteer opportunities will appear here when
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
