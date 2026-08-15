import Link from "next/link";

export function ParticipationInvitation({ headline }: { headline: string }) {
  const subject = encodeURIComponent(
    `A Story from Fayette County Habitat: ${headline}`,
  );
  return (
    <aside
      id="participate"
      aria-labelledby="participation-heading"
      className="border-border bg-secondary/55 mt-16 border-y py-10 sm:mt-24 sm:py-14"
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <p className="text-primary text-sm font-bold tracking-[0.14em] uppercase">
          Find your place
        </p>
        <h2
          id="participation-heading"
          className="mt-4 max-w-xl font-serif text-3xl leading-tight sm:text-4xl"
        >
          Every good neighbor brings something different.
        </h2>
        <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
          Lend a hand, share a skill, pass along useful goods, or help a Story
          travel farther. There is more than one meaningful way to participate.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold">
          <a
            className="text-primary hover:text-secondary-foreground underline decoration-2 underline-offset-4"
            href={`mailto:?subject=${subject}`}
          >
            Share this Story
          </a>
          <Link
            className="text-foreground decoration-editorial-paintbrush hover:text-primary underline decoration-2 underline-offset-4"
            href="/"
          >
            Return home
          </Link>
        </div>
      </div>
    </aside>
  );
}
