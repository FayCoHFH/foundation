import Link from "next/link";
import type { ReactNode } from "react";

type Handoff = Readonly<{ id: string; url: string }> | null;

export function PublicHandoff({
  destination,
  action,
}: {
  destination: Handoff;
  action: "Donate" | "Volunteer";
}) {
  if (!destination) {
    return (
      <p className="border-border bg-surface-subtle max-w-2xl border-l-4 p-5">
        {action === "Donate"
          ? "General giving is not available yet. Please check back soon."
          : "General volunteer registration is not available yet. Please check back soon."}
      </p>
    );
  }

  return (
    <div>
      <a
        className="bg-primary text-primary-foreground inline-flex min-h-12 items-center rounded-sm px-5 py-3 font-bold no-underline hover:brightness-95"
        href={destination.url}
        aria-label={`${action} (opens the secure DonorView ${action === "Donate" ? "giving page" : "volunteer registration"})`}
      >
        {action}
        <span aria-hidden="true" className="ml-2">
          ↗
        </span>
      </a>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-6">
        {action === "Donate"
          ? "Donation processing is handled securely through DonorView."
          : "Volunteer registration continues securely through DonorView."}
      </p>
    </div>
  );
}

export function ParticipationLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="decoration-primary/50 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      href={href}
    >
      {children}
      <span aria-hidden="true" className="ml-2">
        →
      </span>
    </Link>
  );
}
