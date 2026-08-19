import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";

export const metadata: Metadata = {
  title: "ReStore",
  description: "Current Fayette County Habitat ReStore information.",
};

export default function ReStorePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="public-page-main flex-1">
        <section className="public-page-header">
          <div className="public-page-header-inner">
            <p className="public-kicker">Habitat ReStore</p>
            <h1 className="public-page-title">
              A local place to support the work.
            </h1>
            <p className="public-page-deck">
              Current store hours, donation guidance, and visit details will be
              published here after they are verified.
            </p>
          </div>
        </section>
        <div className="public-content-wrap">
          <section
            className="public-restore-status"
            aria-labelledby="restore-status-heading"
          >
            <p className="public-kicker">Information status</p>
            <h2
              id="restore-status-heading"
              className="public-section-heading mt-3"
            >
              ReStore details are being confirmed.
            </h2>
            <p className="public-section-intro">
              ReStore is a first-class part of Fayette County Habitat’s public
              experience. Operational details are intentionally withheld until
              the current store information and policies are confirmed.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
