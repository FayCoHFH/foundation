import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/platform/auth/auth";
import { withPseudonymousRateLimitIdentity } from "@/platform/auth/rate-limit-identity";
import { readServerEnvironment } from "@/platform/config/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = toNextJsHandler(auth);

function authenticationDisabled() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: Request) {
  const environment = readServerEnvironment();
  if (!environment.authEnabled) return authenticationDisabled();
  return handler.GET(withPseudonymousRateLimitIdentity(request, environment));
}

export async function POST(request: Request) {
  const environment = readServerEnvironment();
  if (!environment.authEnabled) return authenticationDisabled();
  return handler.POST(withPseudonymousRateLimitIdentity(request, environment));
}
