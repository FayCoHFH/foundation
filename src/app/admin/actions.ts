"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/platform/auth/auth";
import { recordAuthenticationAudit } from "@/platform/auth/auth-audit";
import { withPseudonymousRateLimitHeaders } from "@/platform/auth/rate-limit-identity";
import { safeAdminNextPath } from "@/platform/auth/principal";
import { readServerEnvironment } from "@/platform/config/environment";

export async function startGoogleSignIn(formData: FormData) {
  const environment = readServerEnvironment();
  if (!environment.authEnabled) redirect("/admin/sign-in?error=disabled");
  const callbackURL = safeAdminNextPath(String(formData.get("next") ?? ""));
  const requestHeaders = withPseudonymousRateLimitHeaders(
    await headers(),
    environment,
  );
  const response = await auth.api.signInSocial({
    headers: requestHeaders,
    body: {
      provider: "google",
      callbackURL,
      errorCallbackURL: "/admin/sign-in?error=provider",
      requestSignUp: true,
    },
  });
  if (!response.url) redirect("/admin/sign-in?error=provider");
  redirect(response.url);
}

export async function signOutAdmin() {
  const environment = readServerEnvironment();
  const requestHeaders = withPseudonymousRateLimitHeaders(
    await headers(),
    environment,
  );
  const session = await auth.api.getSession({ headers: requestHeaders });
  await auth.api.signOut({ headers: requestHeaders });
  if (session) {
    await recordAuthenticationAudit(session.user.id, "admin.auth.logout");
  }
  redirect("/admin/sign-in");
}
