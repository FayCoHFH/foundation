"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  convertStorySubmissionAction,
  type StoryConversionActionState,
} from "./actions";

const initialState: StoryConversionActionState = { status: "idle" };

export function StoryConversionForm({
  submissionId,
  expectedVersion,
}: {
  submissionId: string;
  expectedVersion: number;
}) {
  const [state, action, pending] = useActionState(
    convertStorySubmissionAction,
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form action={action} className="border-border mt-5 border-y py-5">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <p className="text-muted-foreground max-w-3xl text-sm">
        Creating a Story draft begins editorial work. It does not publish this
        submission or establish publication consent. The confidential source,
        review notes, consent records, clearances, and evidence remain separate.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmConversion"
          value="on"
          required
          className="mt-1"
        />
        <span>
          Create a private Story draft from this accepted submission for
          editorial review.
        </span>
      </label>
      {state.status === "error" ? (
        <p
          role="alert"
          tabIndex={-1}
          className="text-destructive mt-4 text-sm font-semibold"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.storyId ? (
        <p role="status" className="mt-4 text-sm font-semibold">
          {state.message}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href={`/admin/communications/stories/${state.storyId}`}
          >
            Open Story draft
          </Link>
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground mt-5 min-h-11 rounded-sm px-4 font-semibold disabled:opacity-60"
      >
        {pending ? "Creating draft…" : "Create Story draft"}
      </button>
    </form>
  );
}
