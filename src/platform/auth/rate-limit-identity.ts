import { createHmac } from "node:crypto";

export const RATE_LIMIT_IDENTITY_HEADER =
  "x-habitat-pseudonymous-rate-limit-ip";

type RateLimitIdentityEnvironment = {
  readonly authSecret: string;
  readonly isVercel: boolean;
};

function pseudonymousIpv6(value: string, secret: string) {
  const digest = createHmac("sha256", secret).update(value).digest("hex");
  return digest.slice(0, 32).match(/.{4}/g)?.join(":") ?? "::";
}

/**
 * Replace Vercel's platform-overwritten client address with a keyed,
 * pseudonymous IPv6-shaped value before Better Auth forms its database key.
 * Outside Vercel, remove any caller-supplied internal header so rate limiting
 * deliberately falls back to one shared per-path bucket.
 */
export function withPseudonymousRateLimitIdentity(
  request: Request,
  environment: RateLimitIdentityEnvironment,
) {
  return new Request(request, {
    headers: withPseudonymousRateLimitHeaders(request.headers, environment),
  });
}

export function withPseudonymousRateLimitHeaders(
  input: HeadersInit,
  environment: RateLimitIdentityEnvironment,
) {
  const headers = new Headers(input);
  headers.delete(RATE_LIMIT_IDENTITY_HEADER);

  if (environment.isVercel) {
    const forwarded = headers.get("x-vercel-forwarded-for")?.trim();
    if (forwarded) {
      headers.set(
        RATE_LIMIT_IDENTITY_HEADER,
        pseudonymousIpv6(forwarded.slice(0, 512), environment.authSecret),
      );
    }
  }

  return headers;
}
