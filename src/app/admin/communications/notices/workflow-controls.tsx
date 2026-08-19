"use client";

import { useActionState } from "react";

import type { SiteNoticeAdmin } from "@/modules/communications/notices";

export type NoticeWorkflowState = {
  status: "idle" | "error";
  message?: string;
};

type NoticeWorkflowAction = (
  previousState: NoticeWorkflowState,
  formData: FormData,
) => Promise<NoticeWorkflowState>;

const initialState: NoticeWorkflowState = { status: "idle" };

export function NoticeWorkflowControls({
  notice,
  action,
}: {
  notice: SiteNoticeAdmin;
  action: NoticeWorkflowAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const canPublish =
    notice.lifecycle === "DRAFT" &&
    Boolean(notice.title.trim()) &&
    Boolean(notice.message.trim()) &&
    Boolean(
      notice.startsAt && notice.endsAt && notice.startsAt < notice.endsAt,
    ) &&
    Boolean(notice.ctaLabel) === Boolean(notice.ctaUrl);
  const canWithdraw = notice.lifecycle === "PUBLISHED";

  if (!canPublish && !canWithdraw && state.status !== "error") return null;

  return (
    <section
      aria-labelledby="site-notice-workflow-heading"
      className="border-border mt-10 border-t pt-7"
    >
      <h2 id="site-notice-workflow-heading" className="type-display text-2xl">
        Publication actions
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Publishing makes this notice eligible for its scheduled window.
        Withdrawing removes it from public display immediately and preserves the
        record.
      </p>
      {state.status === "error" ? (
        <p
          role="alert"
          className="text-destructive mt-4 border-l-4 pl-4 font-semibold"
        >
          {state.message}
        </p>
      ) : null}
      <form action={formAction} className="mt-5 flex flex-wrap gap-3">
        <input type="hidden" name="noticeId" value={notice.id} />
        <input type="hidden" name="expectedVersion" value={notice.version} />
        {canPublish ? (
          <button
            type="submit"
            name="action"
            value="publish"
            disabled={pending}
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:opacity-60"
          >
            {pending ? "Working…" : "Publish Site Notice"}
          </button>
        ) : null}
        {canWithdraw ? (
          <button
            type="submit"
            name="action"
            value="withdraw"
            disabled={pending}
            className="border-destructive text-destructive inline-flex min-h-11 items-center rounded-sm border px-4 py-2 font-semibold disabled:opacity-60"
          >
            {pending ? "Working…" : "Withdraw from public display"}
          </button>
        ) : null}
      </form>
    </section>
  );
}
