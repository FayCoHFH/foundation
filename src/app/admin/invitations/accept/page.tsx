import type { Metadata } from "next";

import { acceptInvitation } from "@/app/admin/invitations/accept/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Accept administration invitation",
  referrer: "no-referrer",
};

type InvitationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitationPage({
  searchParams,
}: InvitationPageProps) {
  const parameters = await searchParams;
  const token = typeof parameters.token === "string" ? parameters.token : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="text-primary text-sm font-semibold">Administration</p>
      <h1 className="text-foreground mt-4 font-serif text-4xl leading-tight">
        Accept administration invitation
      </h1>
      <p className="text-muted-foreground mt-5 text-lg leading-8">
        Continue only if you expected this invitation. The next step must use
        the matching verified Google Workspace account.
      </p>
      <form action={acceptInvitation} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <Button type="submit">Verify invitation</Button>
      </form>
    </main>
  );
}
