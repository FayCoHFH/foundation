"use client";

import { useActionState, useState } from "react";

import {
  submissionWorkflowAction,
  type SubmissionWorkflowActionState,
} from "./actions";

const initialState: SubmissionWorkflowActionState = { status: "idle" };

const ACTIONS = {
  RECEIVED: [
    ["begin-review", "Begin Review"],
    ["accept", "Accept"],
    ["decline", "Decline"],
    ["mark-spam", "Mark as Spam"],
  ],
  IN_REVIEW: [
    ["mark-follow-up", "Mark for Follow-Up"],
    ["accept", "Accept"],
    ["decline", "Decline"],
    ["mark-spam", "Mark as Spam"],
  ],
  FOLLOW_UP: [
    ["resume-review", "Resume Review"],
    ["accept", "Accept"],
    ["decline", "Decline"],
    ["mark-spam", "Mark as Spam"],
  ],
  ACCEPTED: [],
  DECLINED: [],
  SPAM: [],
} as const;

export type SubmissionWorkflowAction =
  (typeof ACTIONS)[keyof typeof ACTIONS][number][0];

export function submissionActionsForStatus(status: keyof typeof ACTIONS) {
  return ACTIONS[status];
}

export function SubmissionWorkflowControls({
  submissionId,
  expectedVersion,
  status,
  canRestoreSpam = false,
}: {
  submissionId: string;
  expectedVersion: number;
  status: keyof typeof ACTIONS;
  canRestoreSpam?: boolean;
}) {
  const [confirmingSpam, setConfirmingSpam] = useState(false);
  const [state, action, pending] = useActionState(
    submissionWorkflowAction,
    initialState,
  );
  const actions = submissionActionsForStatus(status).filter(
    ([value]) => value !== "mark-spam",
  );
  const canMarkSpam =
    status === "RECEIVED" || status === "IN_REVIEW" || status === "FOLLOW_UP";

  return (
    <section
      aria-labelledby="submission-actions-heading"
      className="border-border mt-10 border-t pt-7"
    >
      <h2 id="submission-actions-heading" className="type-display text-2xl">
        Lifecycle actions
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Accept, Decline, and Mark as Spam are terminal actions. Spam can only
        return to ordinary triage through the dedicated higher-authority restore
        action.
      </p>
      {state.status === "error" ? (
        <p
          role="alert"
          className="text-destructive mt-4 border-l-4 pl-4 font-semibold"
        >
          {state.message}
        </p>
      ) : null}
      {actions.length ? (
        <form action={action} className="mt-5 flex flex-wrap gap-3">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="expectedVersion" value={expectedVersion} />
          {actions.map(([value, label], index) => (
            <button
              key={value}
              type="submit"
              name="action"
              value={value}
              disabled={pending}
              className={
                index === 0
                  ? "bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:opacity-60"
                  : "border-border bg-surface text-foreground inline-flex min-h-11 items-center rounded-sm border px-4 py-2 font-semibold disabled:opacity-60"
              }
            >
              {pending ? "Working…" : label}
            </button>
          ))}
        </form>
      ) : status === "SPAM" && canRestoreSpam ? (
        <div className="border-border mt-5 border-l-4 pl-4">
          <p className="text-muted-foreground max-w-2xl text-sm">
            Restoration returns this submission to normal triage; it does not
            accept or approve it.
          </p>
          <form action={action} className="mt-4">
            <input type="hidden" name="submissionId" value={submissionId} />
            <input
              type="hidden"
              name="expectedVersion"
              value={expectedVersion}
            />
            <button
              type="submit"
              name="action"
              value="restore-spam"
              disabled={pending}
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:opacity-60"
            >
              {pending ? "Working…" : "Restore to Received"}
            </button>
          </form>
        </div>
      ) : status === "SPAM" ? (
        <p className="border-border text-muted-foreground mt-5 border-l-4 pl-4">
          This submission is terminal for ordinary reviewers. Only an
          administrator with the higher restore capability can return it to
          Received.
        </p>
      ) : (
        <p className="border-border text-muted-foreground mt-5 border-l-4 pl-4">
          This submission is terminal. No further lifecycle actions are
          available.
        </p>
      )}
      {canMarkSpam && !confirmingSpam ? (
        <button
          type="button"
          onClick={() => setConfirmingSpam(true)}
          disabled={pending}
          className="border-border bg-surface text-foreground mt-3 inline-flex min-h-11 items-center rounded-sm border px-4 py-2 font-semibold disabled:opacity-60"
        >
          Mark as Spam
        </button>
      ) : null}
      {canMarkSpam && confirmingSpam ? (
        <div className="border-border mt-5 border-l-4 pl-4">
          <p className="text-muted-foreground max-w-2xl text-sm">
            This submission will leave ordinary triage. Only an administrator
            with the higher restore capability can restore it to Received.
          </p>
          <form action={action} className="mt-4 flex flex-wrap gap-3">
            <input type="hidden" name="submissionId" value={submissionId} />
            <input
              type="hidden"
              name="expectedVersion"
              value={expectedVersion}
            />
            <button
              type="submit"
              name="action"
              value="mark-spam"
              disabled={pending}
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:opacity-60"
            >
              {pending ? "Working…" : "Confirm Mark as Spam"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingSpam(false)}
              disabled={pending}
              className="border-border bg-surface text-foreground inline-flex min-h-11 items-center rounded-sm border px-4 py-2 font-semibold disabled:opacity-60"
            >
              Cancel
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
