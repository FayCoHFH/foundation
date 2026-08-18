import Link from "next/link";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { prisma } from "@/platform/database/prisma";

export async function SiteFooter() {
  const [donate, volunteer] = await Promise.all([
    getPublicGlobalDestination(prisma, "GENERAL_DONATE"),
    getPublicGlobalDestination(prisma, "GENERAL_VOLUNTEER"),
  ]);
  return (
    <footer className="border-border bg-editorial-pecan text-editorial-cream border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr] lg:px-12">
        <div>
          <p className="font-serif text-xl">
            Fayette County Habitat for Humanity
          </p>
          <p className="text-editorial-cream-muted mt-3 max-w-md text-sm leading-6">
            Strong communities are built from many kinds of contribution.
          </p>
        </div>
        <div className="text-editorial-cream-muted text-sm leading-6 md:text-right">
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
            {volunteer ? null : null}
            {!donate && !volunteer ? (
              <p id="giving-status">
                General giving and volunteer destinations are not configured
                yet.
              </p>
            ) : null}
          </div>
          <p className="mt-3">Public experience foundation</p>
        </div>
      </div>
    </footer>
  );
}
