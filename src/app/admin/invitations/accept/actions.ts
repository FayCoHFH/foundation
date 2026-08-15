"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createInvitationProof,
  digestInvitationToken,
  INVITATION_PROOF_COOKIE,
  INVITATION_PROOF_MAX_AGE_SECONDS,
} from "@/platform/auth/invitation-proof";
import { readServerEnvironment } from "@/platform/config/environment";
import { prisma } from "@/platform/database/prisma";

export async function acceptInvitation(formData: FormData) {
  const invitationToken = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(invitationToken)) {
    redirect("/admin/sign-in?error=invitation");
  }
  const environment = readServerEnvironment();
  const invitation = await prisma.adminInvitation.findFirst({
    where: {
      tokenDigest: digestInvitationToken(invitationToken),
      hostedDomain: environment.googleWorkspaceDomain,
      status: "PENDING",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!invitation) redirect("/admin/sign-in?error=invitation");

  const cookieStore = await cookies();
  cookieStore.set(
    INVITATION_PROOF_COOKIE,
    createInvitationProof(invitationToken),
    {
      httpOnly: true,
      secure: environment.secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: INVITATION_PROOF_MAX_AGE_SECONDS,
    },
  );
  redirect("/admin/sign-in?invitation=ready");
}
