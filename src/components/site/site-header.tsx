import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-border bg-background border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-foreground text-base font-semibold no-underline"
        >
          Fayette County Habitat for Humanity
        </Link>
        <nav aria-label="Foundation navigation">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <li>
              <Link href="#foundation">Foundation</Link>
            </li>
            <li>
              <Link href="#accessibility">Accessibility</Link>
            </li>
            <li>
              <a href="#giving-status">Giving status</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
