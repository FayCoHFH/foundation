import { describe, expect, it } from "vitest";

import {
  PUBLIC_STORY_FORM_ACCEPTED_IMAGE_TYPES,
  PUBLIC_STORY_FORM_ACKNOWLEDGMENTS,
  PUBLIC_STORY_FORM_DISABLED_MESSAGE,
  PUBLIC_STORY_FORM_IMAGE_LIMITS,
  PUBLIC_STORY_FORM_PRIVACY_POINTS,
  PUBLIC_STORY_FORM_REJECTION_MESSAGES,
  PUBLIC_STORY_FORM_TITLE,
  PUBLIC_STORY_ROUTE,
  publicStorySubmissionCanSend,
} from "@/modules/communications/submissions/public-story-form-content";
import { parsePublicStorySubmissionForm } from "@/modules/communications/submissions/intake-request";

describe("C6B-4A public Share Your Story form contract", () => {
  it.each([
    ["route", PUBLIC_STORY_ROUTE, "/share-your-story"],
    ["title", PUBLIC_STORY_FORM_TITLE, "Share Your Story"],
    [
      "disabled state",
      PUBLIC_STORY_FORM_DISABLED_MESSAGE,
      "not accepting submissions",
    ],
  ])("keeps the %s stable", (_label, actual, expected) => {
    expect(actual).toContain(expected);
  });

  it.each([
    ["maximum image count", PUBLIC_STORY_FORM_IMAGE_LIMITS.maxItems, 10],
    [
      "maximum image bytes",
      PUBLIC_STORY_FORM_IMAGE_LIMITS.maxBytes,
      10 * 1024 * 1024,
    ],
    [
      "maximum total bytes",
      PUBLIC_STORY_FORM_IMAGE_LIMITS.maxTotalBytes,
      60 * 1024 * 1024,
    ],
  ])("enforces %s", (_label, actual, expected) =>
    expect(actual).toBe(expected),
  );

  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["heic", "image/heic"],
    ["heif", "image/heif"],
  ])("accepts %s", (_label, mime) =>
    expect(PUBLIC_STORY_FORM_ACCEPTED_IMAGE_TYPES).toContain(mime),
  );

  it.each(
    PUBLIC_STORY_FORM_ACKNOWLEDGMENTS.map((text, index) => [index + 1, text]),
  )("includes required acknowledgment %s", (_index, text) =>
    expect(text.length).toBeGreaterThan(20),
  );

  it.each(PUBLIC_STORY_FORM_PRIVACY_POINTS)(
    "states privacy boundary: %s",
    (point) => {
      expect(point).toBeTruthy();
    },
  );

  it.each(Object.entries(PUBLIC_STORY_FORM_REJECTION_MESSAGES))(
    "maps %s to a safe message",
    (_reason, message) => {
      expect(message).not.toMatch(/token|hash|key|decoder|path|stack/i);
      expect(message.length).toBeGreaterThan(10);
    },
  );

  it.each([
    [[], false, true],
    [[], true, true],
    [["READY"], false, false],
    [["READY"], true, true],
    [["PROCESSING"], true, false],
    [["UPLOADED"], true, false],
    [["PENDING_UPLOAD"], true, false],
    [["REJECTED"], true, false],
    [["REMOVED"], true, false],
    [["READY", "READY"], true, true],
  ] as const)(
    "applies the final READY gate to %j / rights %s",
    (statuses, rights, expected) => {
      expect(publicStorySubmissionCanSend(statuses, rights)).toBe(expected);
    },
  );

  it("requires a separate privacy acknowledgment and preserves scalar-only parsing", () => {
    const form = new FormData();
    form.set("formToken", "token");
    form.set("honeypot", "");
    form.set("submitterName", "Jordan Example");
    form.set("submitterEmail", "jordan@example.org");
    form.set("relationshipToHabitat", "Volunteer");
    form.set(
      "storyText",
      "A sufficiently long plain-text story about this community and Habitat.",
    );
    form.set("contactConsent", "true");
    form.set("privacyNoticeVersion", "public-story-v1");
    form.set("editorialReviewAcknowledged", "true");
    form.set("sensitiveDataWarningAcknowledged", "true");
    expect(parsePublicStorySubmissionForm(form)).toMatchObject({
      kind: "security",
    });
    form.set("privacyNoticeAcknowledged", "true");
    expect(parsePublicStorySubmissionForm(form)).toMatchObject({ kind: "ok" });
    form.set(
      "file",
      new File(["not a story"], "story.txt", { type: "text/plain" }),
    );
    expect(parsePublicStorySubmissionForm(form)).toMatchObject({
      kind: "security",
      reason: "shape",
    });
  });
});
