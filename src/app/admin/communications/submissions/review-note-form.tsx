"use client";

import { useActionState } from "react";

import {
  submissionReviewNoteAction,
  type SubmissionReviewNoteActionState,
} from "./actions";

const initialState = (value: string): SubmissionReviewNoteActionState => ({
  status: "idle",
  value,
});

export function SubmissionReviewNoteForm({
  submissionId,
  expectedVersion,
  initialValue,
}: {
  submissionId: string;
  expectedVersion: number;
  initialValue: string;
}) {
  const [state, action, pending] = useActionState(
    submissionReviewNoteAction,
    initialState(initialValue),
  );

  return (
    <form action={action} className="border-border mt-7 border-t pt-6">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="internal-review-note" className="font-semibold">
          Internal review note
        </label>
        <span
          id="internal-review-note-hint"
          className="text-muted-foreground text-sm"
        >
          Private to authorized reviewers · 2,000 characters maximum
        </span>
      </div>
      {state.status === "error" ? (
        <div
          id="internal-review-note-error"
          role="alert"
          className="text-destructive mt-3 border-l-4 pl-4 font-semibold"
        >
          <a
            href="#internal-review-note"
            className="underline underline-offset-4"
          >
            Review note error:
          </a>{" "}
          {state.message}
        </div>
      ) : null}
      <textarea
        key={
          state.status === "error"
            ? `${state.status}-${state.value}`
            : "initial"
        }
        id="internal-review-note"
        name="internalReviewNote"
        defaultValue={state.value}
        maxLength={2_000}
        rows={6}
        aria-describedby={
          state.status === "error"
            ? "internal-review-note-hint internal-review-note-error"
            : "internal-review-note-hint"
        }
        aria-invalid={state.status === "error" ? true : undefined}
        className="border-input bg-surface text-foreground mt-3 w-full max-w-3xl rounded-sm border px-3 py-2"
      />
      <p className="text-muted-foreground mt-2 text-sm">
        Do not copy this note into public content or include confidential
        details in external messages.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground mt-4 inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save internal note"}
      </button>
    </form>
  );
}
