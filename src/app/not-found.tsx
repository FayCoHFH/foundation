import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="text-primary text-sm font-semibold tracking-wide">
        Not found
      </p>
      <h1 className="text-foreground type-display mt-4 text-4xl leading-tight">
        This page is not available.
      </h1>
      <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-8">
        The address may be incorrect, or this part of the platform is not
        available in the foundation environment.
      </p>
      <div className="mt-8">
        <ButtonLink href="/">Return to the foundation home</ButtonLink>
      </div>
      <p className="text-muted-foreground mt-8 text-sm">
        Need help finding something?{" "}
        <Link href="/#accessibility">View the foundation details</Link>.
      </p>
    </main>
  );
}
