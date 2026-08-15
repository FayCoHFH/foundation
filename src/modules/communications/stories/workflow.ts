import type { PublicationWorkflowState } from "@/generated/prisma/client";
import { PreconditionError } from "@/platform/errors/app-error";

export type StoryWorkflowAction =
  "SUBMIT" | "REQUEST_CHANGES" | "SEND_FOR_APPROVAL" | "APPROVE";

const transitions: Readonly<
  Record<StoryWorkflowAction, ReadonlySet<PublicationWorkflowState>>
> = {
  SUBMIT: new Set(["DRAFT", "CHANGES_REQUESTED"]),
  REQUEST_CHANGES: new Set(["IN_REVIEW"]),
  SEND_FOR_APPROVAL: new Set(["IN_REVIEW"]),
  APPROVE: new Set(["PENDING_APPROVAL"]),
};

const nextStates: Readonly<
  Record<StoryWorkflowAction, PublicationWorkflowState>
> = {
  SUBMIT: "IN_REVIEW",
  REQUEST_CHANGES: "CHANGES_REQUESTED",
  SEND_FOR_APPROVAL: "PENDING_APPROVAL",
  APPROVE: "APPROVED",
};

export function nextStoryWorkflowState(
  current: PublicationWorkflowState,
  action: StoryWorkflowAction,
): PublicationWorkflowState {
  if (!transitions[action].has(current)) {
    throw new PreconditionError(
      `The ${action.toLowerCase().replaceAll("_", " ")} action is not allowed while this Story is ${current.toLowerCase().replaceAll("_", " ")}.`,
    );
  }
  return nextStates[action];
}
