import { readServerEnvironment } from "@/platform/config/environment";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = readServerEnvironment();
  return Response.json(
    {
      status: "ok",
      service: "habitat-web",
      environment: environment.appEnv,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
