import Link from "next/link";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { prisma } from "@/platform/database/prisma";
import { HabitatLogo } from "./habitat-logo";

export async function SiteFooter() {
  const [donate, volunteer] = await Promise.all([
    getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    getPublicGlobalDestination(prisma, "GENERAL_VOLUNTEER"),
  ]);
  return (
    <footer className="border-border bg-brand-traditional-blue text-brand-white border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr] lg:px-12">
        <div>
          <div className="site-footer-logo-inset">
            <HabitatLogo className="site-footer-logo" variant="white" />
          </div>
          <p className="text-brand-white mt-5 max-w-md text-sm leading-6">
            Building and repairing homes with neighbors across Fayette County.
          </p>
        </div>
        <div className="text-brand-white text-sm leading-6 md:text-right">
          <div className="flex flex-wrap justify-start gap-x-5 gap-y-2 md:justify-end">
            <Link href="/give">Why give</Link>
            <Link href="/volunteer">Volunteer</Link>
            {donate ? (
              <a
                href={donate.url}
                aria-label="Donate (opens the secure DonorView giving page)"
              >
                Donate ↗
              </a>
            ) : null}
            {!donate && !volunteer ? (
              <p id="giving-status" className="basis-full">
                General giving and volunteer destinations are not configured
                yet.
              </p>
            ) : null}
          </div>
          <p className="text-brand-white mt-5 text-xs tracking-[0.12em] uppercase">
            Serving neighbors across Fayette County
          </p>
        </div>
      </div>
    </footer>
  );
}
