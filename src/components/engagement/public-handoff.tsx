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
      <p className="public-clay-rule max-w-2xl">
        {action === "Donate"
          ? "General giving is not available yet. Please check back soon."
          : "General volunteer registration is not available yet. Please check back soon."}
      </p>
    );
  }

  return (
    <div>
      <a
        className="public-action-primary"
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
