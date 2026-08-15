import {
  type GoogleProfile,
  verifyGoogleIdToken,
} from "@better-auth/core/social-providers";
import { z } from "zod";

const requiredGoogleClaims = z
  .object({
    sub: z.string().min(1),
    email: z.email(),
    email_verified: z.literal(true),
    hd: z.string().min(1),
    name: z.string().min(1),
    picture: z.string().url().optional(),
  })
  .passthrough();

export type GoogleCallbackTokens = {
  idToken?: string | null | undefined;
};

/**
 * Better Auth 1.6.29's stock authorization-code profile path decodes the ID
 * token. This override performs cryptographic verification before any identity
 * claims can reach persistence or the invitation gate.
 */
export async function verifiedGoogleCallbackUserInfo(
  token: GoogleCallbackTokens,
  audience: string,
  expectedWorkspaceDomain: string,
) {
  if (!token.idToken) return null;
  const verifiedClaims = await verifyGoogleIdToken({
    token: token.idToken,
    audience,
  });
  const parsed = requiredGoogleClaims.safeParse(verifiedClaims);
  if (!parsed.success || parsed.data.hd !== expectedWorkspaceDomain)
    return null;

  const claims = parsed.data;
  return {
    user: {
      id: claims.sub,
      name: claims.name,
      email: claims.email.trim().toLowerCase(),
      ...(claims.picture ? { image: claims.picture } : {}),
      emailVerified: true,
      workspaceDomain: claims.hd.toLowerCase(),
    },
    data: claims as unknown as GoogleProfile,
  };
}
