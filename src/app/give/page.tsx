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
      <main
        id="give-main"
        className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20"
      >
        <p className="text-primary text-sm font-semibold">A way to help</p>
        <h1 className="text-editorial-pecan mt-3 max-w-3xl font-serif text-5xl leading-tight">
          Give where a safe home begins.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-2xl text-xl leading-8">
          Your support helps Fayette County Habitat for Humanity build and
          repair homes with local families and neighbors.
        </p>
        <section
          aria-labelledby="give-next-step"
          className="border-border mt-12 border-t pt-10"
        >
          <h2 id="give-next-step" className="font-serif text-3xl">
            Make a general gift
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
            General giving supports Habitat’s work across Fayette County. The
            secure donation page is hosted and managed by DonorView.
          </p>
          <div className="mt-6">
            <PublicHandoff destination={destination} action="Donate" />
          </div>
        </section>
        <section aria-labelledby="campaign-giving" className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-primary text-sm font-semibold">Campaigns</p>
              <h2 id="campaign-giving" className="mt-2 font-serif text-3xl">
                Support a specific effort
              </h2>
            </div>
            <ParticipationLink href="/campaigns">
              Explore all Campaigns
            </ParticipationLink>
          </div>
          {supportingCampaigns.length ? (
            <ul className="mt-6 max-w-4xl">
              {supportingCampaigns.map((campaign) => (
                <li key={campaign.slug} className="border-border border-t py-5">
                  <Link
                    className="decoration-primary/40 font-serif text-2xl underline underline-offset-4"
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
            <p className="border-border mt-6 max-w-2xl border p-5">
              Campaign-specific giving opportunities will appear here when they
              are ready to share.
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
