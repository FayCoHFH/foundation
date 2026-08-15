import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";

export const metadata: Metadata = { title: "Foundation environment" };

const foundations = [
  ["Stories", "Make room for the people, work, and care behind each result."],
  [
    "Participation",
    "Welcome time, talent, useful goods, attention, and support.",
  ],
  ["Trust", "Let clarity, care, and evidence earn confidence over time."],
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="border-border bg-editorial-sky/40 border-b">
          <div className="editorial-arrival mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
            <p className="text-primary text-sm font-bold tracking-[0.16em] uppercase">
              Fayette County Habitat for Humanity
            </p>
            <h1 className="text-editorial-pecan mt-5 max-w-4xl font-serif text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              A place where many kinds of help can meet.
            </h1>
            <p className="text-muted-foreground mt-8 max-w-2xl text-xl leading-8">
              This public experience is being built to make local work easier to
              understand, trust, and join.
            </p>
            <a
              href="#foundation"
              className="text-primary border-editorial-paintbrush hover:text-secondary-foreground mt-10 inline-flex min-h-11 items-center border-b-2 pb-1 text-sm font-bold no-underline transition-colors motion-reduce:transition-none"
            >
              Explore the foundation
            </a>
          </div>
        </section>
        <section
          id="foundation"
          aria-labelledby="foundation-title"
          className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12"
        >
          <div className="max-w-2xl">
            <p className="text-primary text-sm font-bold tracking-[0.16em] uppercase">
              Built with care
            </p>
            <h2
              id="foundation-title"
              className="text-editorial-pecan mt-4 font-serif text-4xl leading-tight"
            >
              Useful before promotional.
            </h2>
          </div>
          <dl className="border-border mt-12 grid gap-x-10 gap-y-10 border-t pt-10 md:grid-cols-3">
            {foundations.map(([title, description]) => (
              <div key={title}>
                <dt className="text-editorial-pecan font-serif text-2xl">
                  {title}
                </dt>
                <dd className="text-muted-foreground mt-3 leading-7">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
