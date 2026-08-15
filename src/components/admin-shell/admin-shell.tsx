import Link from "next/link";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/ui/skip-link";

export type AdminNavigationItem = {
  href: string;
  label: string;
  current?: boolean;
};

export type AdminIdentity = {
  displayName?: string;
  email: string;
};

type AdminShellProps = {
  children: ReactNode;
  identity: AdminIdentity;
  navigation: readonly AdminNavigationItem[];
  accountActions?: ReactNode;
};

/**
 * Presentation-only administrative chrome. Route protection, session lookup,
 * capability filtering, and logout mutation remain server-owned concerns.
 */
export function AdminShell({
  children,
  identity,
  navigation,
  accountActions,
}: AdminShellProps) {
  const identityLabel = identity.displayName
    ? `${identity.displayName} (${identity.email})`
    : identity.email;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <SkipLink targetId="admin-main" label="Skip to administration content" />
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/admin"
            className="text-foreground font-semibold no-underline"
          >
            Fayette Habitat Administration
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Signed in as {identityLabel}
            </span>
            {accountActions}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[90rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-border bg-surface-subtle border-b lg:min-h-[calc(100vh-4.25rem)] lg:border-r lg:border-b-0">
          <details className="group" open>
            <summary className="cursor-pointer px-5 py-4 font-semibold sm:px-8 lg:pointer-events-none lg:cursor-default lg:px-6">
              Administration navigation
            </summary>
            <nav
              aria-label="Administration"
              className="px-5 pb-5 sm:px-8 lg:px-6"
            >
              <ul className="space-y-1">
                {navigation.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={item.current ? "page" : undefined}
                      className="text-foreground hover:bg-secondary focus-visible:bg-secondary block rounded-sm px-3 py-2 text-sm font-medium"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </aside>
        <main
          id="admin-main"
          tabIndex={-1}
          className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
