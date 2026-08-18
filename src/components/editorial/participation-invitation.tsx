import Link from "next/link";

export function ParticipationInvitation({ headline }: { headline: string }) {
  const subject = encodeURIComponent(
    `A Story from Fayette County Habitat: ${headline}`,
  );
  return (
    <aside
      id="participate"
      aria-labelledby="participation-heading"
      className="public-help-band mt-16 sm:mt-24"
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <p className="text-clean-white text-sm font-bold tracking-[0.08em] uppercase">
          Find your place
        </p>
        <h2
          id="participation-heading"
          className="mt-4 max-w-xl font-serif text-4xl leading-tight font-semibold"
        >
          Every good neighbor brings something different.
        </h2>
        <p className="text-clean-white/85 mt-5 max-w-2xl text-lg leading-8">
          Lend a hand, share a skill, pass along useful goods, or help a Story
          travel farther. There is more than one meaningful way to participate.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold">
          <a
            className="text-clean-white decoration-habitat-green underline decoration-2 underline-offset-4"
            href={`mailto:?subject=${subject}`}
          >
            Share this Story
          </a>
          <Link
            className="text-clean-white decoration-texas-clay underline decoration-2 underline-offset-4"
            href="/"
          >
            Return home
          </Link>
        </div>
      </div>
    </aside>
  );
}
