import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createInitialSuperAdminInvitation } from "../src/platform/auth/super-admin-bootstrap";
import { loadEnvironmentFiles } from "../src/platform/config/load-environment-files";

loadEnvironmentFiles();

const confirmation = process.env.BOOTSTRAP_CONFIRMATION;
const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
const expectedDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;
const appBaseUrl = process.env.APP_BASE_URL;
const connectionString =
  process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

if (confirmation !== "CREATE INITIAL SUPER ADMIN") {
  throw new Error(
    'Set BOOTSTRAP_CONFIRMATION="CREATE INITIAL SUPER ADMIN" for this explicit one-time operation.',
  );
}
if (!email || !expectedDomain || !appBaseUrl || !connectionString) {
  throw new Error(
    "BOOTSTRAP_SUPER_ADMIN_EMAIL, GOOGLE_WORKSPACE_DOMAIN, APP_BASE_URL, and a database URL are required.",
  );
}

const bootstrapEmail = email;
const bootstrapDomain = expectedDomain;
const bootstrapBaseUrl = appBaseUrl;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function bootstrap() {
  const result = await createInitialSuperAdminInvitation(prisma, {
    appBaseUrl: bootstrapBaseUrl,
    email: bootstrapEmail,
    expectedDomain: bootstrapDomain,
  });

  console.log("Super Admin bootstrap invitation created.");
  console.log(`Invitation ID: ${result.invitationId}`);
  console.log(`Expires: ${result.expiresAt.toISOString()}`);
  console.log(
    "Treat the following one-time URL as a secret and share it privately:",
  );
  console.log(result.invitationUrl);
}

bootstrap()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
