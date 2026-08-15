"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  assignPlacement,
  cancelFuturePlacement,
  clearPlacement,
} from "@/modules/communications/placements";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AuthorizationError } from "@/platform/errors/app-error";

async function actor() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  return access.principal;
}
export async function homepagePlacementForm(data: FormData) {
  const placement = z
    .enum(["HOME_HERO", "HOME_FEATURED_STORY", "HOME_FEATURED_NEWS"])
    .parse(data.get("placement"));
  const action = z
    .enum(["assign", "schedule", "clear", "cancel"])
    .parse(data.get("action"));
  if (action === "clear")
    await clearPlacement(prisma, await actor(), placement);
  else if (action === "cancel")
    await cancelFuturePlacement(
      prisma,
      await actor(),
      z.string().uuid().parse(data.get("placementId")),
    );
  else {
    const input = {
      key: placement,
      publicationId: z.string().uuid().parse(data.get("publicationId")),
    };
    await assignPlacement(
      prisma,
      await actor(),
      action === "schedule"
        ? { ...input, startsAt: z.coerce.date().parse(data.get("startsAt")) }
        : input,
    );
  }
  redirect(`/admin/communications/homepage?notice=${action}`);
}
