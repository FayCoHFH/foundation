"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  assignCanonicalDestination,
  createDonorViewDestination,
  deactivateDonorViewDestination,
  updateDonorViewDestination,
  verifyDonorViewDestination,
} from "@/modules/engagement";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError, AuthorizationError } from "@/platform/errors/app-error";

export type DestinationActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

const purpose = z.enum([
  "GENERAL_DONATE",
  "CAMPAIGN_DONATE",
  "GENERAL_VOLUNTEER",
  "VOLUNTEER_EVENT",
] as const);
const destinationSchema = z.object({
  purpose,
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(2_048),
  pageReference: z.string().trim().max(160),
});

async function principal() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  return access.principal;
}

function message(error: unknown) {
  return error instanceof AppError && error.expose
    ? error.message
    : "The DonorView destination action could not be completed.";
}

function state(error: unknown): DestinationActionState {
  return { status: "error", message: message(error) };
}

export async function createDestinationAction(
  _previous: DestinationActionState,
  formData: FormData,
): Promise<DestinationActionState> {
  const parsed = destinationSchema.safeParse({
    purpose: formData.get("purpose"),
    label: formData.get("label"),
    url: formData.get("url"),
    pageReference: formData.get("pageReference") ?? "",
  });
  if (!parsed.success)
    return { status: "error", message: "Complete the destination fields." };
  try {
    await createDonorViewDestination(prisma, await principal(), parsed.data);
    revalidatePath("/admin/engagement");
    return { status: "success", message: "Destination saved as unverified." };
  } catch (error) {
    return state(error);
  }
}

export async function updateDestinationAction(
  _previous: DestinationActionState,
  formData: FormData,
): Promise<DestinationActionState> {
  const parsed = destinationSchema.safeParse({
    purpose: formData.get("purpose"),
    label: formData.get("label"),
    url: formData.get("url"),
    pageReference: formData.get("pageReference") ?? "",
  });
  const id = z.string().uuid().safeParse(formData.get("id"));
  const expectedVersion = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(formData.get("expectedVersion"));
  if (!parsed.success || !id.success || !expectedVersion.success)
    return {
      status: "error",
      message: "Reload the destination and try again.",
    };
  try {
    await updateDonorViewDestination(prisma, await principal(), {
      ...parsed.data,
      id: id.data,
      expectedVersion: expectedVersion.data,
    });
    revalidatePath("/admin/engagement");
    return { status: "success", message: "Destination updated." };
  } catch (error) {
    return state(error);
  }
}

export async function verifyDestinationAction(
  formData: FormData,
): Promise<void> {
  try {
    const id = z.string().uuid().parse(formData.get("id"));
    const expectedVersion = z.coerce
      .number()
      .int()
      .positive()
      .parse(formData.get("expectedVersion"));
    await verifyDonorViewDestination(prisma, await principal(), {
      id,
      expectedVersion,
    });
    revalidatePath("/admin/engagement");
  } catch (error) {
    throw new Error(message(error));
  }
  redirect("/admin/engagement");
}

export async function deactivateDestinationAction(
  formData: FormData,
): Promise<void> {
  try {
    const id = z.string().uuid().parse(formData.get("id"));
    const expectedVersion = z.coerce
      .number()
      .int()
      .positive()
      .parse(formData.get("expectedVersion"));
    await deactivateDonorViewDestination(prisma, await principal(), {
      id,
      expectedVersion,
    });
    revalidatePath("/admin/engagement");
  } catch (error) {
    throw new Error(message(error));
  }
  redirect("/admin/engagement");
}

export async function assignCanonicalDestinationAction(
  formData: FormData,
): Promise<void> {
  try {
    const selectedPurpose = purpose.parse(formData.get("purpose"));
    if (
      selectedPurpose !== "GENERAL_DONATE" &&
      selectedPurpose !== "GENERAL_VOLUNTEER"
    )
      throw new Error(
        "Only general Donate and Volunteer destinations are canonical.",
      );
    const destinationId = z
      .union([z.string().uuid(), z.literal("")])
      .parse(formData.get("destinationId"));
    const expectedVersion = z.coerce
      .number()
      .int()
      .positive()
      .parse(formData.get("expectedVersion"));
    await assignCanonicalDestination(prisma, await principal(), {
      purpose: selectedPurpose,
      destinationId: destinationId || null,
      expectedVersion,
    });
    revalidatePath("/admin/engagement");
  } catch (error) {
    throw new Error(message(error));
  }
  redirect("/admin/engagement");
}
