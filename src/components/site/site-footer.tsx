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
    <footer className="site-footer border-border bg-brand-traditional-blue text-brand-white border-t">
      <div className="site-footer-inner mx-auto max-w-7xl">
        <div className="site-footer-intro">
          <div className="site-footer-logo-inset">
            <HabitatLogo
              className="site-footer-logo"
              variant="white"
              priority
            />
          </div>
          <p className="text-brand-white mt-5 max-w-md leading-7">
            Building and repairing homes with neighbors across Fayette County.
          </p>
        </div>
        <nav className="site-footer-nav" aria-label="Footer navigation">
          <div>
            <h2>Explore</h2>
            <ul>
              <li>
                <Link href="/news">News</Link>
              </li>
              <li>
                <Link href="/projects">Projects</Link>
              </li>
              <li>
                <Link href="/campaigns">Campaigns</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Participate</h2>
            <ul>
              <li>
                <Link href="/volunteer">Volunteer</Link>
              </li>
              <li>
                <Link href="/share-your-story">Share your story</Link>
              </li>
              <li>
                <Link href="/restore">ReStore</Link>
              </li>
              <li>
                <Link href="/give">Why give</Link>
              </li>
            </ul>
          </div>
        </nav>
        <div className="site-footer-status">
          {donate ? (
            <a
              className="site-footer-donate"
              href={donate.url}
              aria-label="Donate (opens the secure DonorView giving page)"
            >
              Donate ↗
            </a>
          ) : null}
          {!donate && !volunteer ? (
            <p id="giving-status">
              Giving and volunteer destinations are not configured yet.
            </p>
          ) : null}
          <p className="text-brand-white text-xs tracking-[0.12em] uppercase">
            Fayette County Habitat for Humanity
          </p>
        </div>
      </div>
      <div className="site-footer-legal mx-auto max-w-7xl">
        <span>
          © {new Date().getFullYear()} Fayette County Habitat for Humanity
        </span>
        <span>Public information is published as it is verified.</span>
      </div>
    </footer>
  );
}
