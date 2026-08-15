"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  saveStoryRevisionAction,
  type StoryActionState,
} from "@/app/admin/communications/stories/actions";
import { StoryFields } from "@/app/admin/communications/stories/story-create-form";

export function StoryEditorForm({
  storyId,
  version,
  headline,
  deck,
  excerpt,
  body,
}: {
  storyId: string;
  version: number;
  headline: string;
  deck: string | null;
  excerpt: string;
  body: string;
}) {
  const initial: StoryActionState = {
    status: "idle",
    values: { headline, deck: deck ?? "", excerpt, body },
  };
  const [state, action, pending] = useActionState(
    saveStoryRevisionAction,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <StoryFields
      state={state}
      action={action}
      pending={pending}
      submitLabel="Save successor revision"
      storyId={storyId}
      expectedVersion={version}
    />
  );
}
