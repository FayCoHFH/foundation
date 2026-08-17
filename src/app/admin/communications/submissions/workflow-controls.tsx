"use client";

import { useActionState } from "react";

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
}: {
  submissionId: string;
  expectedVersion: number;
  status: keyof typeof ACTIONS;
}) {
  const [state, action, pending] = useActionState(
    submissionWorkflowAction,
    initialState,
  );
  const actions = submissionActionsForStatus(status);

  return (
    <section
      aria-labelledby="submission-actions-heading"
      className="border-border mt-10 border-t pt-7"
    >
      <h2 id="submission-actions-heading" className="font-serif text-2xl">
        Lifecycle actions
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Accept, Decline, and Mark as Spam are terminal actions. They cannot be
        reopened or restored here.
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
      ) : (
        <p className="border-border text-muted-foreground mt-5 border-l-4 pl-4">
          This submission is terminal. No further lifecycle actions are
          available.
        </p>
      )}
    </section>
  );
}
