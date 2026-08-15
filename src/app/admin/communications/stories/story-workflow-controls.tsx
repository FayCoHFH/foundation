"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  storyWorkflowAction,
  type StoryWorkflowActionState,
} from "@/app/admin/communications/stories/actions";
import { Button } from "@/components/ui/button";

const initialState: StoryWorkflowActionState = { status: "idle" };

export function StoryWorkflowControls({
  storyId,
  version,
  contentHash,
  workflow,
  canSubmit,
  canReview,
  canApprove,
  canPublish,
  canWithdraw,
  releaseState,
  slug,
}: {
  storyId: string;
  version: number;
  contentHash: string;
  workflow: string;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
  releaseState: string;
  slug: string | null;
}) {
  const [state, action, pending] = useActionState(
    storyWorkflowAction,
    initialState,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  const actionName =
    (workflow === "DRAFT" || workflow === "CHANGES_REQUESTED") && canSubmit
      ? "submit"
      : workflow === "IN_REVIEW" && canReview
        ? "send-for-approval"
        : workflow === "PENDING_APPROVAL" && canApprove
          ? "approve"
          : null;
  const needsChangeRequest = workflow === "IN_REVIEW" && canReview;
  const canRelease = workflow === "APPROVED" && canPublish;
  const canWithdrawStory = releaseState === "PUBLISHED" && canWithdraw;
  if (!actionName && !needsChangeRequest && !canRelease && !canWithdrawStory)
    return null;
  return (
    <section
      aria-labelledby="workflow-actions-heading"
      className="border-border mt-10 border-t pt-7"
    >
      <h2 id="workflow-actions-heading" className="text-xl font-semibold">
        Workflow actions
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Actions bind to revision content hash {contentHash.slice(0, 12)}….
      </p>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error"
              ? "text-destructive mt-4"
              : "text-foreground mt-4"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="storyId" value={storyId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <input type="hidden" name="expectedContentHash" value={contentHash} />
        {canRelease ? (
          <div>
            <label htmlFor="slug" className="block font-semibold">
              Canonical URL slug
            </label>
            <input
              id="slug"
              name="slug"
              required
              defaultValue={slug ?? ""}
              placeholder="a-lasting-story"
              className="border-input bg-surface text-foreground mt-2 w-full rounded-sm border px-3 py-2"
            />
          </div>
        ) : null}
        {needsChangeRequest || canWithdrawStory ? (
          <div>
            <label htmlFor="reason" className="block font-semibold">
              {canWithdrawStory
                ? "Withdrawal reason"
                : "Reason for requested changes"}
            </label>
            <textarea
              id="reason"
              name="reason"
              required={canWithdrawStory}
              rows={3}
              maxLength={1000}
              className="border-input bg-surface text-foreground mt-2 w-full rounded-sm border px-3 py-2"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {actionName ? (
            <Button
              type="submit"
              name="action"
              value={actionName}
              disabled={pending}
            >
              {pending
                ? "Updating…"
                : actionName === "submit"
                  ? "Submit for review"
                  : actionName === "send-for-approval"
                    ? "Send for approval"
                    : "Approve exact revision"}
            </Button>
          ) : null}
          {needsChangeRequest ? (
            <Button
              type="submit"
              name="action"
              value="request-changes"
              disabled={pending}
              className="bg-surface text-foreground border-border border"
            >
              Request changes
            </Button>
          ) : null}
          {canRelease ? (
            <Button
              type="submit"
              name="action"
              value="release"
              disabled={pending}
            >
              {pending ? "Releasing…" : "Release immutable public snapshot"}
            </Button>
          ) : null}
          {canWithdrawStory ? (
            <Button
              type="submit"
              name="action"
              value="withdraw"
              disabled={pending}
              className="bg-surface text-foreground border-border border"
            >
              {pending ? "Withdrawing…" : "Withdraw public Story"}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
