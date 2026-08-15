export function SiteFooter() {
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
          <p id="giving-status">
            Giving destinations are not configured in this non-production
            environment.
          </p>
          <p className="mt-3">Public experience foundation</p>
        </div>
      </div>
    </footer>
  );
}
