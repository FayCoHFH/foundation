import type { Metadata } from "next";

import { startGoogleSignIn } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { safeAdminNextPath } from "@/platform/auth/principal";
import { readServerEnvironment } from "@/platform/config/environment";

export const metadata: Metadata = { title: "Admin sign in" };

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const next = safeAdminNextPath(
    typeof parameters.next === "string" ? parameters.next : undefined,
  );
  const error = typeof parameters.error === "string";
  const invitationReady = parameters.invitation === "ready";
  const authEnabled = readServerEnvironment().authEnabled;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="text-primary text-sm font-semibold">Administration</p>
      <h1 className="text-foreground type-display mt-4 text-4xl leading-tight">
        Admin sign in
      </h1>
      <p className="text-muted-foreground mt-5 text-lg leading-8">
        Use the invited Fayette County Habitat for Humanity Google Workspace
        account. Google identity alone does not grant administrative access.
      </p>
      {invitationReady ? (
        <p
          className="bg-secondary text-secondary-foreground mt-6 rounded-md p-4"
          role="status"
        >
          Invitation verified. Continue with the matching Google account.
        </p>
      ) : null}
      {error ? (
        <p
          className="border-destructive text-destructive mt-6 border-l-4 pl-4"
          role="alert"
        >
          Sign-in could not be completed. Check the invited account or contact
          an administrator.
        </p>
      ) : null}
      {authEnabled ? (
        <form action={startGoogleSignIn} className="mt-8">
          <input type="hidden" name="next" value={next} />
          <Button type="submit">Continue with Google</Button>
        </form>
      ) : (
        <p className="text-muted-foreground mt-8">
          Google authentication is disabled in this environment.
        </p>
      )}
      <p className="text-muted-foreground mt-8 text-sm">
        Access problems are handled through the organization&apos;s established
        support path; this page does not reveal invitation or permission data.
      </p>
    </main>
  );
}
