import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { CAPABILITIES } from "../src/platform/auth/capabilities";
import { ROLE_PRESETS } from "../src/platform/auth/role-presets";
import { loadEnvironmentFiles } from "../src/platform/config/load-environment-files";

loadEnvironmentFiles();

const connectionString =
  process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required to seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function describeCapability(capability: string) {
  return `Allows the ${capability.replaceAll(".", " ")} operation.`;
}

async function seed() {
  for (const capability of CAPABILITIES) {
    await prisma.permission.upsert({
      where: { key: capability },
      create: {
        key: capability,
        description: describeCapability(capability),
      },
      update: {
        description: describeCapability(capability),
      },
    });
  }

  const permissions = await prisma.permission.findMany({
    select: { id: true, key: true },
  });
  const permissionIdByKey = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );

  for (const preset of ROLE_PRESETS) {
    const existingRole = await prisma.role.findUnique({
      where: { key: preset.key },
    });
    const role = existingRole
      ? existingRole.name !== preset.name ||
        existingRole.description !== preset.description ||
        !existingRole.isSystem ||
        !existingRole.isActive
        ? await prisma.role.update({
            where: { id: existingRole.id },
            data: {
              name: preset.name,
              description: preset.description,
              isSystem: true,
              isActive: true,
              version: { increment: 1 },
            },
          })
        : existingRole
      : await prisma.role.create({
          data: {
            key: preset.key,
            name: preset.name,
            description: preset.description,
            isSystem: true,
            isActive: true,
          },
        });

    const permissionIds = preset.capabilities.map((capability) => {
      const permissionId = permissionIdByKey.get(capability);
      if (!permissionId) throw new Error(`Missing permission ${capability}`);
      return permissionId;
    });

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissionIds },
      },
    });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }
}

seed()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
