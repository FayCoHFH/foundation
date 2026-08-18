"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  campaignWorkflowAction,
  type CampaignWorkflowActionState,
} from "./actions";

export function CampaignWorkflowControls({
  campaignId,
  version,
  contentHash,
  workflow,
  releaseState,
  slug,
  canSubmit,
  canReview,
  canApprove,
  canRelease,
  canWithdraw,
  canArchive,
}: {
  campaignId: string;
  version: number;
  contentHash: string;
  workflow: string;
  releaseState: string;
  slug: string | null;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canRelease: boolean;
  canWithdraw: boolean;
  canArchive: boolean;
}) {
  const [state, action, pending] = useActionState<
    CampaignWorkflowActionState,
    FormData
  >(campaignWorkflowAction, { status: "idle" });
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  const submit = (name: string, label: string, className?: string) => (
    <Button
      type="submit"
      name="action"
      value={name}
      disabled={pending}
      className={className}
    >
      {pending ? "Updating…" : label}
    </Button>
  );
  const hasAction =
    ((workflow === "DRAFT" || workflow === "CHANGES_REQUESTED") && canSubmit) ||
    (workflow === "IN_REVIEW" && canReview) ||
    (workflow === "PENDING_APPROVAL" && canApprove) ||
    (workflow === "APPROVED" && canRelease) ||
    (releaseState === "PUBLISHED" && canWithdraw) ||
    canArchive;
  if (!hasAction) return null;
  return (
    <section
      aria-labelledby="campaign-workflow-heading"
      className="border-border mt-10 border-t pt-7"
    >
      <h2 id="campaign-workflow-heading" className="text-xl font-semibold">
        Workflow actions
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Actions apply to this exact revision. A released Campaign remains public
        while a successor draft is reviewed.
      </p>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error" ? "text-destructive mt-4" : "mt-4"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <input type="hidden" name="expectedContentHash" value={contentHash} />
        {workflow === "APPROVED" && canRelease ? (
          <label className="block max-w-xl">
            <span className="font-semibold">Canonical public URL slug</span>
            <input
              name="slug"
              required
              defaultValue={slug ?? ""}
              placeholder="community-build-2026"
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            />
          </label>
        ) : null}
        {(workflow === "IN_REVIEW" && canReview) ||
        (releaseState === "PUBLISHED" && canWithdraw) ? (
          <label className="block max-w-xl">
            <span className="font-semibold">
              {releaseState === "PUBLISHED"
                ? "Withdrawal reason"
                : "Reason for requested changes"}
            </span>
            <textarea
              name="reason"
              required={releaseState === "PUBLISHED"}
              maxLength={1000}
              rows={3}
              className="border-input bg-surface mt-2 w-full rounded-sm border px-3 py-2"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {(workflow === "DRAFT" || workflow === "CHANGES_REQUESTED") &&
          canSubmit
            ? submit("submit", "Submit for review")
            : null}
          {workflow === "IN_REVIEW" && canReview ? (
            <>
              {submit(
                "request-changes",
                "Request changes",
                "bg-surface !text-foreground border-border border",
              )}
              {submit("send-for-approval", "Send for approval")}
            </>
          ) : null}
          {workflow === "PENDING_APPROVAL" && canApprove
            ? submit("approve", "Approve exact revision")
            : null}
          {workflow === "APPROVED" && canRelease
            ? submit("release", "Release public snapshot")
            : null}
          {releaseState === "PUBLISHED" && canWithdraw
            ? submit(
                "withdraw",
                "Withdraw public Campaign",
                "bg-surface !text-foreground border-border border",
              )
            : null}
          {canArchive
            ? submit(
                "archive",
                "Archive Campaign",
                "bg-surface !text-foreground border-border border",
              )
            : null}
        </div>
      </form>
    </section>
  );
}
