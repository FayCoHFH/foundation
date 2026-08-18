import {
  PUBLIC_STORY_INTAKE_MAX_FORM_BYTES,
  PUBLIC_STORY_INTAKE_MAX_HONEYPOT_LENGTH,
  PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH,
  type PublicStoryIntakeConfig,
} from "./intake-contract";

const allowedFields = new Set([
  "formToken",
  "honeypot",
  "submitterName",
  "submitterEmail",
  "relationshipToHabitat",
  "suggestedTitle",
  "storyText",
  "contactConsent",
  "privacyNoticeVersion",
  "privacyNoticeAcknowledged",
  "editorialReviewAcknowledged",
  "sensitiveDataWarningAcknowledged",
  "publicationInterest",
  "involvesMinor",
  "involvesHomeownerOrApplicant",
  "containsSensitivePersonalCircumstances",
  "mediaRecoveryToken",
  "mediaAttemptVersion",
  "rightsDeclarationAccepted",
  "submitterLikenessConsentAccepted",
]);

type ParsedForm = Readonly<{
  formToken: string;
  honeypot: string;
  submitterName: string;
  submitterEmail: string;
  relationshipToHabitat: string;
  suggestedTitle: string | null;
  storyText: string;
  contactConsent: boolean;
  privacyNoticeVersion: string;
  privacyNoticeAcknowledged: boolean;
  editorialReviewAcknowledged: boolean;
  sensitiveDataWarningAcknowledged: boolean;
  publicationInterest: boolean | null;
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  containsSensitivePersonalCircumstances: boolean;
  mediaRecoveryToken: string | null;
  mediaAttemptVersion: number | null;
  rightsDeclarationAccepted: boolean | null;
  submitterLikenessConsentAccepted: boolean | null;
}>;

export type ParsedIntakeForm =
  | Readonly<{ kind: "ok"; value: ParsedForm }>
  | Readonly<{ kind: "security"; reason: "shape" | "size" }>;

function scalarValues(formData: FormData, name: string) {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  return values[0];
}

function optionalScalar(formData: FormData, name: string) {
  const values = formData.getAll(name);
  if (values.length === 0) return { ok: true as const, value: null };
  if (values.length !== 1 || typeof values[0] !== "string") {
    return { ok: false as const };
  }
  return { ok: true as const, value: values[0] };
}

function booleanScalar(formData: FormData, name: string, required: boolean) {
  const value = scalarValues(formData, name);
  if (value === null) return required ? null : false;
  if (value === "true" || value === "on") return true;
  if (value === "false") return false;
  return null;
}

function formByteLength(formData: FormData) {
  let bytes = 0;
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") return null;
    bytes += Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
    if (bytes > PUBLIC_STORY_INTAKE_MAX_FORM_BYTES) return bytes;
  }
  return bytes;
}

export function parsePublicStorySubmissionForm(
  formData: FormData,
): ParsedIntakeForm {
  const bytes = formByteLength(formData);
  if (bytes === null) return { kind: "security", reason: "shape" };
  if (bytes > PUBLIC_STORY_INTAKE_MAX_FORM_BYTES) {
    return { kind: "security", reason: "size" };
  }

  for (const key of new Set(formData.keys())) {
    if (!allowedFields.has(key)) return { kind: "security", reason: "shape" };
  }
  for (const key of formData.keys()) {
    if (formData.getAll(key).length > 1) {
      return { kind: "security", reason: "shape" };
    }
  }

  const formToken = scalarValues(formData, "formToken");
  const honeypot = scalarValues(formData, "honeypot");
  if (
    formToken === null ||
    formToken.length > PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH ||
    honeypot === null ||
    honeypot.length > PUBLIC_STORY_INTAKE_MAX_HONEYPOT_LENGTH
  ) {
    return { kind: "security", reason: "shape" };
  }

  const suggestedTitle = optionalScalar(formData, "suggestedTitle");
  const publicationInterest = optionalScalar(formData, "publicationInterest");
  const mediaRecoveryToken = optionalScalar(formData, "mediaRecoveryToken");
  const mediaAttemptVersion = optionalScalar(formData, "mediaAttemptVersion");
  const rightsDeclarationAccepted = optionalScalar(
    formData,
    "rightsDeclarationAccepted",
  );
  const submitterLikenessConsentAccepted = optionalScalar(
    formData,
    "submitterLikenessConsentAccepted",
  );
  if (
    !suggestedTitle.ok ||
    !publicationInterest.ok ||
    !mediaRecoveryToken.ok ||
    !mediaAttemptVersion.ok ||
    !rightsDeclarationAccepted.ok ||
    !submitterLikenessConsentAccepted.ok
  ) {
    return { kind: "security", reason: "shape" };
  }
  if (
    publicationInterest.value !== null &&
    !["true", "false", "on"].includes(publicationInterest.value)
  ) {
    return { kind: "security", reason: "shape" };
  }

  const flags = {
    contactConsent: booleanScalar(formData, "contactConsent", true),
    editorialReviewAcknowledged: booleanScalar(
      formData,
      "editorialReviewAcknowledged",
      true,
    ),
    sensitiveDataWarningAcknowledged: booleanScalar(
      formData,
      "sensitiveDataWarningAcknowledged",
      true,
    ),
    involvesMinor: booleanScalar(formData, "involvesMinor", false),
    involvesHomeownerOrApplicant: booleanScalar(
      formData,
      "involvesHomeownerOrApplicant",
      false,
    ),
    containsSensitivePersonalCircumstances: booleanScalar(
      formData,
      "containsSensitivePersonalCircumstances",
      false,
    ),
    privacyNoticeAcknowledged: booleanScalar(
      formData,
      "privacyNoticeAcknowledged",
      true,
    ),
  };
  if (
    flags.contactConsent === null ||
    flags.editorialReviewAcknowledged === null ||
    flags.sensitiveDataWarningAcknowledged === null ||
    flags.involvesMinor === null ||
    flags.involvesHomeownerOrApplicant === null ||
    flags.containsSensitivePersonalCircumstances === null ||
    flags.privacyNoticeAcknowledged === null
  ) {
    return { kind: "security", reason: "shape" };
  }

  const required = {
    submitterName: scalarValues(formData, "submitterName"),
    submitterEmail: scalarValues(formData, "submitterEmail"),
    relationshipToHabitat: scalarValues(formData, "relationshipToHabitat"),
    storyText: scalarValues(formData, "storyText"),
    privacyNoticeVersion: scalarValues(formData, "privacyNoticeVersion"),
  };

  const optionalBooleanValue = (value: string | null) => {
    if (value === null) return null;
    if (value === "true" || value === "on") return true;
    if (value === "false") return false;
    return undefined;
  };
  const parsedRights = optionalBooleanValue(rightsDeclarationAccepted.value);
  const parsedLikeness = optionalBooleanValue(
    submitterLikenessConsentAccepted.value,
  );
  const parsedAttemptVersion =
    mediaAttemptVersion.value === null
      ? null
      : Number(mediaAttemptVersion.value);
  if (
    parsedRights === undefined ||
    parsedLikeness === undefined ||
    (mediaRecoveryToken.value !== null) !==
      (mediaAttemptVersion.value !== null) ||
    (mediaRecoveryToken.value !== null &&
      mediaRecoveryToken.value.length > PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH) ||
    (mediaAttemptVersion.value !== null &&
      (parsedAttemptVersion === null ||
        !Number.isSafeInteger(parsedAttemptVersion) ||
        parsedAttemptVersion <= 0))
  ) {
    return { kind: "security", reason: "shape" };
  }

  return {
    kind: "ok",
    value: {
      formToken,
      honeypot,
      ...required,
      suggestedTitle: suggestedTitle.value,
      ...flags,
      publicationInterest:
        publicationInterest.value === null
          ? null
          : publicationInterest.value === "true" ||
              publicationInterest.value === "on"
            ? true
            : publicationInterest.value === "false"
              ? false
              : null,
      mediaRecoveryToken: mediaRecoveryToken.value,
      mediaAttemptVersion: parsedAttemptVersion,
      rightsDeclarationAccepted: parsedRights,
      submitterLikenessConsentAccepted: parsedLikeness,
    } as ParsedForm,
  };
}

export function validatePublicStorySubmissionRequestContext(
  headersInit: HeadersInit,
  config: Pick<PublicStoryIntakeConfig, "appOrigin" | "appEnv">,
) {
  const headers = new Headers(headersInit);
  const origin = headers.get("origin");
  if (!origin || origin !== config.appOrigin) return false;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (
    parsedOrigin.origin !== origin ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    origin.includes("*")
  ) {
    return false;
  }
  if (config.appEnv === "production" && parsedOrigin.protocol !== "https:") {
    return false;
  }

  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  const fetchMode = headers.get("sec-fetch-mode")?.trim().toLowerCase();
  if (fetchMode && !["navigate", "same-origin"].includes(fetchMode)) {
    return false;
  }

  const contentType = headers.get("content-type")?.trim().toLowerCase();
  if (
    !contentType ||
    (contentType &&
      !contentType.startsWith("application/x-www-form-urlencoded") &&
      !contentType.startsWith("multipart/form-data;"))
  ) {
    return false;
  }

  const contentLength = headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return false;
    if (Number(contentLength) > PUBLIC_STORY_INTAKE_MAX_FORM_BYTES) {
      return false;
    }
  }
  return true;
}
