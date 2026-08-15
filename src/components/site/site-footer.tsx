export function SiteFooter() {
  return (
    <footer className="border-border bg-surface-subtle border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <p>Fayette County Habitat for Humanity digital platform foundation.</p>
        <p id="giving-status">
          Giving destinations are not configured in this non-production
          environment.
        </p>
      </div>
    </footer>
  );
}
