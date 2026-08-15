"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: Readonly<{ reset: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="text-destructive text-sm font-semibold tracking-wide">
        Something went wrong
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-foreground mt-4 font-serif text-4xl leading-tight"
      >
        We could not load this page.
      </h1>
      <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-8">
        Please try again. If the problem continues, use the organization&apos;s
        established contact path.
      </p>
      <div className="mt-8">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
