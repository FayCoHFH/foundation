import type { Metadata } from "next";

import { signOutAdmin } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="text-destructive text-sm font-semibold">Administration</p>
      <h1 className="text-foreground mt-4 font-serif text-4xl leading-tight">
        Access denied
      </h1>
      <p className="text-muted-foreground mt-5 text-lg leading-8">
        You are signed in, but this account does not currently have access to
        administration. Contact an administrator if this is unexpected.
      </p>
      <form action={signOutAdmin} className="mt-8">
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
