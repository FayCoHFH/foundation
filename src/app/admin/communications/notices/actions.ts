"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createSiteNotice,
  publishSiteNotice,
  updateSiteNotice,
  withdrawSiteNotice,
} from "@/modules/communications/notices";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import {
  AppError,
  AuthorizationError,
  ConcurrencyError,
} from "@/platform/errors/app-error";

import {
  noticeFormError,
  noticeFieldErrorsFromMessage,
  parseNoticeFormInput,
  readNoticeFormValues,
  type NoticeFormState,
} from "./form-contract";

const noticeIdSchema = z.string().uuid();
const versionSchema = z.coerce.number().int().positive();

async function actor() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  return access.principal;
}

function safeErrorState(
  values: ReturnType<typeof readNoticeFormValues>,
  error: unknown,
) {
  if (error instanceof AppError && error.expose) {
    return noticeFormError(
      values,
      error.message,
      noticeFieldErrorsFromMessage(error.message),
    );
  }
  return noticeFormError(
    values,
    "The Site Notice could not be saved. Review the fields and try again.",
  );
}

export async function saveSiteNoticeAction(
  _previousState: NoticeFormState,
  formData: FormData,
): Promise<NoticeFormState> {
  const values = readNoticeFormValues(formData);
  let destination: string | undefined;
  try {
    const principal = await actor();
    const parsed = parseNoticeFormInput(values);
    if ("message" in parsed) {
      return noticeFormError(values, parsed.message, parsed.fieldErrors);
    }

    const noticeId = String(formData.get("noticeId") ?? "").trim();
    if (noticeId) {
      const expectedVersion = versionSchema.parse(
        formData.get("expectedVersion"),
      );
      const id = noticeIdSchema.parse(noticeId);
      await updateSiteNotice(prisma, principal, {
        ...parsed.input,
        noticeId: id,
        expectedVersion,
      });
      destination = `/admin/communications/notices/${id}?notice=notice-updated`;
    } else {
      const notice = await createSiteNotice(prisma, principal, parsed.input);
      destination = `/admin/communications/notices/${notice.id}?notice=notice-created`;
    }
  } catch (error) {
    return safeErrorState(values, error);
  }
  redirect(destination!);
}

export type NoticeWorkflowState = {
  status: "idle" | "error";
  message?: string;
};

export async function siteNoticeWorkflowAction(
  _previousState: NoticeWorkflowState,
  formData: FormData,
): Promise<NoticeWorkflowState> {
  let destination: string | undefined;
  try {
    const principal = await actor();
    const noticeId = noticeIdSchema.parse(formData.get("noticeId"));
    const expectedVersion = versionSchema.parse(
      formData.get("expectedVersion"),
    );
    const action = z
      .enum(["publish", "withdraw"])
      .parse(formData.get("action"));
    if (action === "publish") {
      await publishSiteNotice(prisma, principal, { noticeId, expectedVersion });
      destination = `/admin/communications/notices/${noticeId}?notice=notice-published`;
    } else {
      await withdrawSiteNotice(prisma, principal, {
        noticeId,
        expectedVersion,
      });
      destination = `/admin/communications/notices/${noticeId}?notice=notice-withdrawn`;
    }
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return {
        status: "error",
        message:
          "This Site Notice changed in another session. Reload before submitting again.",
      };
    }
    if (error instanceof AppError && error.expose) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: "The Site Notice action could not be completed. Try again.",
    };
  }
  redirect(destination!);
}
