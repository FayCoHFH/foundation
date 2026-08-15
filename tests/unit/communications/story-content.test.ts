import { describe, expect, it } from "vitest";

import {
  hashStoryCandidate,
  storyDocumentFromPlainText,
  validateStoryDocument,
} from "@/modules/communications/stories/content";
import { nextStoryWorkflowState } from "@/modules/communications/stories/workflow";
import {
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

const candidate = {
  headline: "A stable Story",
  deck: "A short deck",
  excerpt: "A concise internal excerpt.",
  body: storyDocumentFromPlainText("A safe paragraph."),
};

describe("Story structured candidate contract", () => {
  it("hashes the same candidate deterministically without operational metadata", () => {
    const reordered = {
      excerpt: candidate.excerpt,
      body: JSON.parse(JSON.stringify(candidate.body)),
      deck: candidate.deck,
      headline: candidate.headline,
    };
    expect(hashStoryCandidate(candidate)).toBe(hashStoryCandidate(reordered));
    expect(
      hashStoryCandidate({ ...candidate, headline: "A changed Story" }),
    ).not.toBe(hashStoryCandidate(candidate));
  });

  it("accepts a small safe node profile and freezes the persisted document", () => {
    const document = validateStoryDocument({
      schemaVersion: 1,
      root: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Heading" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Read more",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.org/story" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.root)).toBe(true);
  });

  it("rejects raw HTML, unknown nodes, and unsafe link protocols", () => {
    expect(() =>
      validateStoryDocument({
        schemaVersion: 1,
        root: { type: "doc", content: [{ type: "html", value: "<script>" }] },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateStoryDocument({
        schemaVersion: 1,
        root: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Unsafe",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).toThrow(ValidationError);
  });
});

describe("Story candidate workflow", () => {
  it("allows only the documented C1 transition matrix", () => {
    expect(nextStoryWorkflowState("DRAFT", "SUBMIT")).toBe("IN_REVIEW");
    expect(nextStoryWorkflowState("CHANGES_REQUESTED", "SUBMIT")).toBe(
      "IN_REVIEW",
    );
    expect(nextStoryWorkflowState("IN_REVIEW", "REQUEST_CHANGES")).toBe(
      "CHANGES_REQUESTED",
    );
    expect(nextStoryWorkflowState("IN_REVIEW", "SEND_FOR_APPROVAL")).toBe(
      "PENDING_APPROVAL",
    );
    expect(nextStoryWorkflowState("PENDING_APPROVAL", "APPROVE")).toBe(
      "APPROVED",
    );
    expect(() => nextStoryWorkflowState("APPROVED", "SUBMIT")).toThrow(
      PreconditionError,
    );
  });
});
