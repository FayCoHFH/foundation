export const PUBLIC_STORY_ROUTE = "/share-your-story";
export const PUBLIC_STORY_FORM_TITLE = "Share Your Story";
export const PUBLIC_STORY_FORM_DISABLED_MESSAGE =
  "Share Your Story is not accepting submissions right now.";
export const PUBLIC_STORY_FORM_IMAGE_LIMITS = Object.freeze({
  maxItems: 10,
  maxBytes: 10 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
});
export const PUBLIC_STORY_FORM_ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const PUBLIC_STORY_FORM_ACKNOWLEDGMENTS = Object.freeze([
  "I agree that Fayette County Habitat may contact me about this submission.",
  "I understand this will be reviewed by Habitat staff and is not automatically published.",
  "I understand not to include highly sensitive information such as SSNs, financial, medical, password, or exact private-address details.",
  "I have read and acknowledge the current privacy notice.",
] as const);

export const PUBLIC_STORY_FORM_PRIVACY_POINTS = Object.freeze([
  "confidential administrative inbox",
  "authorized Habitat administrators",
  "may contact the submitter",
  "no publication guarantee",
  "publication interest is not publication consent",
  "additional permission for sensitive people, places, and circumstances",
  "do not submit SSNs, financial, medical, password, or exact private-address information",
] as const);

export const PUBLIC_STORY_FORM_REJECTION_MESSAGES = Object.freeze({
  UNSUPPORTED_FORMAT: "This file type isn’t supported.",
  FILE_TOO_LARGE: "This image is larger than 10 MB.",
  DIMENSIONS_EXCEEDED: "This image is too large to process.",
  CORRUPTED_IMAGE: "We couldn’t read this image.",
  DUPLICATE_IMAGE: "This image has already been added.",
  MIME_TYPE_MISMATCH: "This file doesn’t appear to match its image type.",
  MULTI_FRAME_UNSUPPORTED: "Animated or multi-image files aren’t supported.",
  PROCESSING_FAILED: "We couldn’t process this image right now.",
  SUBMISSION_TOTAL_TOO_LARGE:
    "The selected images exceed the 60 MB total limit.",
} as const);

export function publicStorySubmissionCanSend(
  retainedStatuses: readonly string[],
  hasImageRightsDeclaration: boolean,
) {
  const ready = retainedStatuses.every((status) => status === "READY");
  return ready && (retainedStatuses.length === 0 || hasImageRightsDeclaration);
}
