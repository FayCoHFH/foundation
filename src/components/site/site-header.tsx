import Link from "next/link";

export function SiteHeader() {
  const links = (
    <ul className="flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:items-center sm:gap-x-5">
      <li>
        <Link className="hover:text-primary" href="/">
          Home
        </Link>
      </li>
      <li>
        <Link className="hover:text-primary" href="/news">
          News
        </Link>
      </li>
      <li>
        <Link className="hover:text-primary" href="/projects">
          Projects
        </Link>
      </li>
      <li>
        <Link className="hover:text-primary" href="/campaigns">
          Campaigns
        </Link>
      </li>
    </ul>
  );
  return (
    <header className="border-border/80 bg-background/95 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-foreground font-serif text-lg leading-tight font-semibold no-underline sm:text-xl"
        >
          Fayette County Habitat for Humanity
        </Link>
        <nav aria-label="Public navigation" className="hidden sm:block">
          {links}
        </nav>
        <details className="relative sm:hidden">
          <summary className="border-border min-h-11 cursor-pointer rounded-sm border px-3 py-2 text-sm font-semibold">
            Menu
          </summary>
          <nav
            aria-label="Mobile public navigation"
            className="border-border bg-background absolute right-0 z-10 mt-2 border p-4 shadow-lg"
          >
            {links}
          </nav>
        </details>
      </div>
    </header>
  );
}
