import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";

export const metadata: Metadata = {
  title: "Foundation environment",
};

const foundationCapabilities = [
  {
    title: "Clear structure",
    description:
      "Semantic regions, headings, and navigation establish a usable base before product content is introduced.",
  },
  {
    title: "Responsive by default",
    description:
      "The foundation remains readable and operable on small screens, at high zoom, and with user text preferences.",
  },
  {
    title: "Safe to extend",
    description:
      "Future public information and provider handoffs can be added without presenting unverified content today.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <section
          id="foundation"
          aria-labelledby="foundation-title"
          className="border-border bg-surface border-b"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
            <p className="text-primary text-sm font-semibold tracking-wide">
              Foundation environment
            </p>
            <h1
              id="foundation-title"
              className="text-foreground mt-4 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl"
            >
              A clear starting point for the public experience.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8">
              This non-production shell establishes accessible structure,
              responsive presentation, and intentional visual foundations.
              Public content and services will be added only when they are ready
              to be maintained.
            </p>
          </div>
        </section>

        <section
          id="accessibility"
          aria-labelledby="capabilities-title"
          className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-12"
        >
          <div className="max-w-2xl">
            <h2
              id="capabilities-title"
              className="text-foreground font-serif text-3xl leading-tight"
            >
              Built to be useful before it is full.
            </h2>
            <p className="text-muted-foreground mt-4">
              The foundation favors understandable structure and honest
              availability over placeholder features or unsupported claims.
            </p>
          </div>
          <dl className="border-border mt-10 grid gap-8 border-t pt-8 md:grid-cols-3">
            {foundationCapabilities.map((capability) => (
              <div key={capability.title}>
                <dt className="text-foreground text-lg font-semibold">
                  {capability.title}
                </dt>
                <dd className="text-muted-foreground mt-2 text-sm leading-6">
                  {capability.description}
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
