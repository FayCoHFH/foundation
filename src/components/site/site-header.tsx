import Link from "next/link";
import { getPublicGlobalDestination } from "@/modules/engagement";
import { prisma } from "@/platform/database/prisma";
import { HabitatLogo } from "./habitat-logo";

export async function SiteHeader() {
  const donate = await getPublicGlobalDestination(prisma, "GENERAL_DONATE");
  const links = (
    <ul className="site-nav-links">
      <li>
        <Link className="site-nav-link" href="/">
          Home
        </Link>
      </li>
      <li>
        <Link className="site-nav-link" href="/news">
          News
        </Link>
      </li>
      <li>
        <Link className="site-nav-link" href="/projects">
          Projects
        </Link>
      </li>
      <li>
        <Link className="site-nav-link" href="/campaigns">
          Campaigns
        </Link>
      </li>
      <li>
        <Link className="site-nav-link" href="/volunteer">
          Volunteer
        </Link>
      </li>
      {donate ? (
        <li>
          <a
            className="site-nav-action"
            href={donate.url}
            aria-label="Donate (opens the secure DonorView giving page)"
          >
            Donate <span aria-hidden="true">↗</span>
          </a>
        </li>
      ) : null}
    </ul>
  );
  return (
    <header className="site-header">
      <div className="site-header-inner mx-auto max-w-7xl">
        <Link href="/" className="site-wordmark">
          <HabitatLogo
            className="site-wordmark-logo"
            variant="black"
            priority
          />
        </Link>
        <nav aria-label="Public navigation" className="hidden sm:block">
          {links}
        </nav>
        <details className="site-mobile-menu sm:hidden">
          <summary className="site-mobile-trigger">Menu</summary>
          <nav
            className="site-mobile-nav"
            aria-label="Mobile public navigation"
          >
            {links}
          </nav>
        </details>
      </div>
    </header>
  );
}
