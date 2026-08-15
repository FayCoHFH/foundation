import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-border/80 bg-background/95 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-foreground font-serif text-lg leading-tight font-semibold no-underline sm:text-xl"
        >
          Fayette County Habitat for Humanity
        </Link>
        <nav aria-label="Public navigation">
          <ul className="flex items-center gap-x-5 text-sm font-semibold">
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
          </ul>
        </nav>
      </div>
    </header>
  );
}
