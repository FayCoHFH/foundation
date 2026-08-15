"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createStoryAction,
  type StoryActionState,
} from "@/app/admin/communications/stories/actions";
import { Button } from "@/components/ui/button";

const initialState: StoryActionState = {
  status: "idle",
  values: { headline: "", deck: "", excerpt: "", body: "" },
};

export function StoryCreateForm() {
  const [state, action, pending] = useActionState(
    createStoryAction,
    initialState,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success" && state.storyId) {
      router.push(`/admin/communications/stories/${state.storyId}`);
    }
  }, [router, state.status, state.storyId]);

  return (
    <StoryFields
      state={state}
      action={action}
      pending={pending}
      submitLabel="Create Story draft"
    />
  );
}

export function StoryFields({
  state,
  action,
  pending,
  submitLabel,
  storyId,
  expectedVersion,
}: {
  state: StoryActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  storyId?: string;
  expectedVersion?: number;
}) {
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-8 max-w-3xl space-y-6" noValidate>
      {storyId ? <input type="hidden" name="storyId" value={storyId} /> : null}
      {expectedVersion ? (
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
      ) : null}
      {state.status === "error" ? (
        <div
          className="border-destructive text-destructive border-l-4 pl-4"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">Story was not saved</p>
          <p className="mt-1 text-sm">{state.message}</p>
        </div>
      ) : null}
      <div>
        <label
          htmlFor="headline"
          className="text-foreground block font-semibold"
        >
          Story title
        </label>
        <input
          key={`headline-${state.values.headline}`}
          id="headline"
          name="headline"
          required
          maxLength={180}
          defaultValue={state.values.headline}
          aria-invalid={errors.headline ? true : undefined}
          aria-describedby={errors.headline ? "headline-error" : undefined}
          className="border-input bg-surface text-foreground mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
        />
        {errors.headline ? (
          <p id="headline-error" className="text-destructive mt-2 text-sm">
            {errors.headline}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="deck" className="text-foreground block font-semibold">
          Deck{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          key={`deck-${state.values.deck}`}
          id="deck"
          name="deck"
          rows={2}
          maxLength={300}
          defaultValue={state.values.deck}
          aria-invalid={errors.deck ? true : undefined}
          aria-describedby={errors.deck ? "deck-error" : undefined}
          className="border-input bg-surface text-foreground mt-2 w-full rounded-sm border px-3 py-2"
        />
        {errors.deck ? (
          <p id="deck-error" className="text-destructive mt-2 text-sm">
            {errors.deck}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="excerpt"
          className="text-foreground block font-semibold"
        >
          Excerpt
        </label>
        <textarea
          key={`excerpt-${state.values.excerpt}`}
          id="excerpt"
          name="excerpt"
          rows={3}
          required
          maxLength={600}
          defaultValue={state.values.excerpt}
          aria-invalid={errors.excerpt ? true : undefined}
          aria-describedby={errors.excerpt ? "excerpt-error" : undefined}
          className="border-input bg-surface text-foreground mt-2 w-full rounded-sm border px-3 py-2"
        />
        {errors.excerpt ? (
          <p id="excerpt-error" className="text-destructive mt-2 text-sm">
            {errors.excerpt}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="body" className="text-foreground block font-semibold">
          Story body
        </label>
        <p id="body-help" className="text-muted-foreground mt-1 text-sm">
          Plain text is stored as a validated schema-versioned structured
          document. Rich editing comes later.
        </p>
        <textarea
          key={`body-${state.values.body}`}
          id="body"
          name="body"
          rows={12}
          required
          defaultValue={state.values.body}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? "body-help body-error" : "body-help"}
          className="border-input bg-surface text-foreground mt-2 w-full rounded-sm border px-3 py-2"
        />
        {errors.body ? (
          <p id="body-error" className="text-destructive mt-2 text-sm">
            {errors.body}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
