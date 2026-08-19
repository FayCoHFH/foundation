"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { submitPublicStorySubmissionAction } from "@/modules/communications/submissions/intake-action";
import {
  PUBLIC_STORY_FORM_ACCEPTED_IMAGE_TYPES,
  PUBLIC_STORY_FORM_IMAGE_LIMITS,
  PUBLIC_STORY_FORM_REJECTION_MESSAGES,
  publicStorySubmissionCanSend,
} from "@/modules/communications/submissions/public-story-form-content";
import type { PublicStoryIntakeOutcome } from "@/modules/communications/submissions/intake-contract";

type SubmissionMediaSensitivity = Readonly<{
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  involvesOtherIdentifiablePerson: boolean;
  depictsPrivateResidence: boolean;
  containsSensitivePersonalCircumstances: boolean;
}>;

const SUBMISSION_MEDIA_MAX_CREDIT_LENGTH = 160;
const SUBMISSION_MEDIA_MAX_DESCRIPTION_LENGTH = 300;
const SUBMISSION_MEDIA_MAX_ITEMS = PUBLIC_STORY_FORM_IMAGE_LIMITS.maxItems;
const SUBMISSION_MEDIA_MAX_TOTAL_BYTES =
  PUBLIC_STORY_FORM_IMAGE_LIMITS.maxTotalBytes;
const SUBMISSION_MEDIA_MAX_BYTES = PUBLIC_STORY_FORM_IMAGE_LIMITS.maxBytes;
const submissionMediaMimeTypes = PUBLIC_STORY_FORM_ACCEPTED_IMAGE_TYPES;

const recoveryStorageKey = "habitat.share-your-story.recovery-token";
const accepted = submissionMediaMimeTypes.join(",");

type Media = {
  id: string;
  version: number;
  ordinal: number | null;
  byteSize: number | null;
  technicalStatus: string;
  rejectionReason: string | null;
  description: string | null;
  suggestedPhotoCredit: string | null;
  sensitivity: SubmissionMediaSensitivity;
  previewUrl?: string;
  progress?: number;
  message?: string;
};

type Attempt = {
  recoveryToken: string;
  attemptId: string;
  version: number;
  media: Media[];
};

type FormState = Readonly<{
  outcome: PublicStoryIntakeOutcome | null;
  submitted: boolean;
}>;

const initialState: FormState = { outcome: null, submitted: false };

function statusLabel(media: Media) {
  if (media.technicalStatus === "READY") return "Ready";
  if (media.technicalStatus === "REJECTED") return "Rejected";
  if (media.technicalStatus === "PROCESSING") return "Processing";
  return "Uploading";
}

function emptySensitivity(): SubmissionMediaSensitivity {
  return {
    involvesMinor: false,
    involvesHomeownerOrApplicant: false,
    involvesOtherIdentifiablePerson: false,
    depictsPrivateResidence: false,
    containsSensitivePersonalCircumstances: false,
  };
}

async function post(path: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = await fetch(path, {
    method: "POST",
    body,
    mode: "same-origin",
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "That image step could not be completed.",
    );
  return data;
}

function sensitivityFields(sensitivity: SubmissionMediaSensitivity) {
  return Object.fromEntries(
    Object.entries(sensitivity).map(([key, value]) => [key, String(value)]),
  );
}

export function PublicStorySubmissionForm({
  formToken,
  privacyNoticeVersion,
}: {
  formToken: string;
  privacyNoticeVersion: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_previous, formData) => ({
      outcome: await submitPublicStorySubmissionAction(formData),
      submitted: false,
    }),
    initialState,
  );
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [imageRights, setImageRights] = useState(false);
  const [likenessConsent, setLikenessConsent] = useState(false);
  const [totalBytes, setTotalBytes] = useState(0);
  const [textFields, setTextFields] = useState({
    submitterName: "",
    submitterEmail: "",
    relationshipToHabitat: "",
    suggestedTitle: "",
    storyText: "",
  });
  const [acknowledgments, setAcknowledgments] = useState({
    publicationInterest: false,
    contactConsent: false,
    editorialReviewAcknowledged: false,
    sensitiveDataWarningAcknowledged: false,
    privacyNoticeAcknowledged: false,
    involvesMinor: false,
    involvesHomeownerOrApplicant: false,
    containsSensitivePersonalCircumstances: false,
  });
  const [mediaFeedback, setMediaFeedback] = useState<{
    kind: "error" | "status";
    message: string;
  } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = sessionStorage.getItem(recoveryStorageKey) ?? "";
    post("/api/public-story-submission/media/attempt", {
      recoveryToken: stored,
    })
      .then((data) => {
        if (cancelled) return;
        const next = data.attempt as Attempt;
        next.recoveryToken = data.recoveryToken as string;
        setAttempt(next);
        setTotalBytes(
          next.media.reduce((sum, item) => sum + (item.byteSize ?? 0), 0),
        );
        sessionStorage.setItem(recoveryStorageKey, next.recoveryToken);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      state.outcome &&
      state.outcome.code !== "ACCEPTED" &&
      state.outcome.code !== "DUPLICATE_ACCEPTED"
    )
      summaryRef.current?.focus();
    if (
      state.outcome?.code === "ACCEPTED" ||
      state.outcome?.code === "DUPLICATE_ACCEPTED"
    ) {
      sessionStorage.removeItem(recoveryStorageKey);
    }
  }, [state.outcome]);

  const retained = useMemo(
    () =>
      attempt?.media.filter(
        (item) => !["REJECTED", "REMOVED"].includes(item.technicalStatus),
      ) ?? [],
    [attempt],
  );
  const visibleMedia = useMemo(
    () =>
      attempt?.media.filter((item) => item.technicalStatus !== "REMOVED") ?? [],
    [attempt],
  );
  const ready = publicStorySubmissionCanSend(
    retained.map((item) => item.technicalStatus),
    imageRights,
  );
  const uploadDisabled =
    mediaBusy || retained.length >= SUBMISSION_MEDIA_MAX_ITEMS;

  async function refresh(currentAttempt = attempt) {
    if (!currentAttempt) return null;
    const data = await post("/api/public-story-submission/media/attempt", {
      recoveryToken: currentAttempt.recoveryToken,
    });
    const next = data.attempt as Attempt;
    next.recoveryToken = currentAttempt.recoveryToken;
    const previews = new Map(
      currentAttempt.media
        .filter((item) => item.previewUrl)
        .map((item) => [item.id, item.previewUrl]),
    );
    next.media = next.media.map((item) => {
      const previewUrl = previews.get(item.id);
      return previewUrl ? { ...item, previewUrl } : item;
    });
    setAttempt(next);
    setTotalBytes(
      next.media.reduce((sum, item) => sum + (item.byteSize ?? 0), 0),
    );
    return next;
  }

  async function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    if (!attempt) return;
    setMediaBusy(true);
    setMediaFeedback(null);
    let workingAttempt = attempt;
    let workingRetained = retained;
    let workingTotalBytes = totalBytes;
    try {
      for (const file of Array.from(event.target.files ?? [])) {
        if (workingRetained.length >= SUBMISSION_MEDIA_MAX_ITEMS) break;
        if (
          !submissionMediaMimeTypes.includes(
            file.type as (typeof submissionMediaMimeTypes)[number],
          )
        ) {
          setMediaFeedback({
            kind: "error",
            message: "This file type isn’t supported.",
          });
          continue;
        }
        if (
          file.size > SUBMISSION_MEDIA_MAX_BYTES ||
          workingTotalBytes + file.size > SUBMISSION_MEDIA_MAX_TOTAL_BYTES
        ) {
          setMediaFeedback({
            kind: "error",
            message:
              file.size > SUBMISSION_MEDIA_MAX_BYTES
                ? "This image is larger than 10 MB."
                : "The selected images exceed the 60 MB total limit.",
          });
          continue;
        }
        const issued = await post("/api/public-story-submission/media/issue", {
          recoveryToken: workingAttempt.recoveryToken,
          expectedAttemptVersion: String(workingAttempt.version),
          declaredMimeType: file.type,
          originalFilename: file.name,
          description: "",
          suggestedPhotoCredit: "",
          ...sensitivityFields(emptySensitivity()),
        });
        const issuedMedia = issued.media as Media;
        workingAttempt = {
          ...workingAttempt,
          version: issued.attemptVersion as number,
          media: [
            ...workingAttempt.media,
            {
              ...issuedMedia,
              previewUrl: URL.createObjectURL(file),
              progress: 0,
            },
          ],
        };
        workingRetained = workingAttempt.media.filter(
          (item) => !["REJECTED", "REMOVED"].includes(item.technicalStatus),
        );
        workingTotalBytes += file.size;
        setAttempt(workingAttempt);
        setTotalBytes(workingTotalBytes);
        const uploadData = new FormData();
        uploadData.set(
          "uploadAuthorization",
          issued.uploadAuthorization as string,
        );
        uploadData.set("declaredMimeType", file.type);
        uploadData.set("file", file);
        const uploadResponse = await fetch(
          "/api/public-story-submission/media/upload",
          { method: "POST", body: uploadData, mode: "same-origin" },
        );
        const uploaded = (await uploadResponse.json()) as {
          kind?: string;
          media?: Media;
          reason?: string;
        };
        if (!uploadResponse.ok || uploaded.kind === "rejected") {
          workingAttempt = (await refresh(workingAttempt)) ?? workingAttempt;
          workingRetained = workingAttempt.media.filter(
            (item) => !["REJECTED", "REMOVED"].includes(item.technicalStatus),
          );
          workingTotalBytes = workingAttempt.media.reduce(
            (sum, item) => sum + (item.byteSize ?? 0),
            0,
          );
          setMediaFeedback({
            kind: "error",
            message:
              PUBLIC_STORY_FORM_REJECTION_MESSAGES[
                uploaded.reason as keyof typeof PUBLIC_STORY_FORM_REJECTION_MESSAGES
              ] ?? "We couldn’t process this image right now.",
          });
          continue;
        }
        workingAttempt = {
          ...workingAttempt,
          media: workingAttempt.media.map((item) =>
            item.id === issuedMedia.id
              ? {
                  ...item,
                  ...(uploaded.media as Media),
                  technicalStatus: "PROCESSING",
                  message: "This image is being checked privately.",
                  progress: 100,
                }
              : item,
          ),
        };
        setAttempt(workingAttempt);
        const processed = await post(
          "/api/public-story-submission/media/process",
          {
            attemptId: workingAttempt.attemptId,
            mediaId: issuedMedia.id,
            expectedMediaVersion: String((uploaded.media as Media).version),
          },
        );
        if (processed.kind === "rejected") {
          workingAttempt = (await refresh(workingAttempt)) ?? workingAttempt;
          workingRetained = workingAttempt.media.filter(
            (item) => !["REJECTED", "REMOVED"].includes(item.technicalStatus),
          );
          setMediaFeedback({
            kind: "error",
            message:
              PUBLIC_STORY_FORM_REJECTION_MESSAGES[
                String(
                  processed.reason,
                ) as keyof typeof PUBLIC_STORY_FORM_REJECTION_MESSAGES
              ] ?? "We couldn’t process this image right now.",
          });
        } else {
          workingAttempt = {
            ...workingAttempt,
            media: workingAttempt.media.map((item) =>
              item.id === issuedMedia.id
                ? { ...item, ...(processed.media as Media) }
                : item,
            ),
          };
          setAttempt(workingAttempt);
        }
        workingAttempt = (await refresh(workingAttempt)) ?? workingAttempt;
        workingRetained = workingAttempt.media.filter(
          (item) => !["REJECTED", "REMOVED"].includes(item.technicalStatus),
        );
        workingTotalBytes = workingAttempt.media.reduce(
          (sum, item) => sum + (item.byteSize ?? 0),
          0,
        );
      }
    } catch (error) {
      setMediaFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "We couldn’t complete that image step right now.",
      });
    } finally {
      event.target.value = "";
      setMediaBusy(false);
    }
  }

  async function updateMetadata(media: Media, values: Partial<Media>) {
    if (!attempt) return;
    const next = {
      ...media,
      ...values,
      sensitivity: values.sensitivity ?? media.sensitivity,
    };
    setAttempt((current) =>
      current
        ? {
            ...current,
            media: current.media.map((item) =>
              item.id === media.id ? next : item,
            ),
          }
        : current,
    );
    try {
      const result = await post("/api/public-story-submission/media/metadata", {
        recoveryToken: attempt.recoveryToken,
        mediaId: media.id,
        expectedMediaVersion: String(media.version),
        description: next.description ?? "",
        suggestedPhotoCredit: next.suggestedPhotoCredit ?? "",
        ...sensitivityFields(next.sensitivity),
      });
      setAttempt((current) =>
        current
          ? {
              ...current,
              media: current.media.map((item) =>
                item.id === media.id
                  ? { ...item, ...(result.media as Media) }
                  : item,
              ),
            }
          : current,
      );
    } catch {
      await refresh();
    }
  }

  async function removeMedia(media: Media) {
    if (!attempt) return;
    setMediaBusy(true);
    try {
      await post("/api/public-story-submission/media/remove", {
        recoveryToken: attempt.recoveryToken,
        mediaId: media.id,
        expectedMediaVersion: String(media.version),
      });
      if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
      await refresh();
    } finally {
      setMediaBusy(false);
    }
  }

  async function moveMedia(index: number, direction: -1 | 1) {
    if (!attempt) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= retained.length) return;
    const ids = retained.map((item) => item.id);
    const currentId = ids[index]!;
    ids[index] = ids[nextIndex]!;
    ids[nextIndex] = currentId;
    try {
      const result = await post("/api/public-story-submission/media/reorder", {
        recoveryToken: attempt.recoveryToken,
        expectedAttemptVersion: String(attempt.version),
        mediaIds: JSON.stringify(ids),
      });
      setAttempt((current) =>
        current
          ? {
              ...current,
              version: result.version as number,
              media: result.media as Media[],
            }
          : current,
      );
    } catch {
      await refresh();
    }
  }

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="formToken" value={formToken} />
      <input
        type="hidden"
        name="privacyNoticeVersion"
        value={privacyNoticeVersion}
      />
      {attempt && retained.length > 0 ? (
        <>
          <input
            type="hidden"
            name="mediaRecoveryToken"
            value={attempt.recoveryToken}
          />
          <input
            type="hidden"
            name="mediaAttemptVersion"
            value={attempt.version}
          />
        </>
      ) : null}
      {state.outcome &&
      state.outcome.code !== "ACCEPTED" &&
      state.outcome.code !== "DUPLICATE_ACCEPTED" ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="border-destructive text-destructive border-l-4 pl-4"
        >
          <p className="font-semibold">We couldn’t receive your story yet.</p>
          <p className="mt-1 text-sm">{state.outcome.message}</p>
          {state.outcome.fieldErrors ? (
            <ul className="mt-3 list-disc pl-5 text-sm">
              {Object.entries(state.outcome.fieldErrors).map(
                ([field, message]) => (
                  <li key={field}>
                    <a className="underline" href={`#${field}`}>
                      {message}
                    </a>
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.outcome?.code === "ACCEPTED" ||
      state.outcome?.code === "DUPLICATE_ACCEPTED" ? (
        <section
          aria-live="polite"
          className="border-editorial-oak/50 bg-editorial-cream border-l-4 p-6"
        >
          <h2 className="text-charcoal font-serif text-3xl">Thank you.</h2>
          <p className="mt-3 leading-7">
            Your story has been received for confidential review. We won’t send
            email from this form.
          </p>
        </section>
      ) : null}
      <aside
        className="border-border bg-editorial-cream border-y px-5 py-6"
        aria-labelledby="privacy-summary-heading"
      >
        <h2
          id="privacy-summary-heading"
          className="text-charcoal font-serif text-2xl"
        >
          A private place to begin
        </h2>
        <p className="mt-3 leading-7">
          Your submission goes to a confidential administrative inbox reviewed
          by authorized Habitat administrators. We may contact you about what
          you share, but sending a story does not guarantee publication.
        </p>
        <p className="mt-3 leading-7">
          Publication interest is not publication consent. Additional permission
          is needed before publishing information about minors, homeowners,
          applicants, identifiable people, private residences, or sensitive
          personal circumstances.
        </p>
        <p className="mt-3 leading-7">
          Please do not include Social Security numbers, financial, medical, or
          password information, or exact private addresses. This form uses
          Habitat’s current privacy notice; its recorded version is{" "}
          {privacyNoticeVersion}.
        </p>
      </aside>
      <section aria-labelledby="story-details-heading" className="space-y-7">
        <h2
          id="story-details-heading"
          className="text-charcoal font-serif text-3xl"
        >
          Your story
        </h2>
        <div className="grid gap-7 sm:grid-cols-2">
          <label
            className="text-foreground font-semibold"
            htmlFor="submitterName"
          >
            Name
            <input
              id="submitterName"
              name="submitterName"
              value={textFields.submitterName}
              onChange={(event) =>
                setTextFields((current) => ({
                  ...current,
                  submitterName: event.target.value,
                }))
              }
              required
              maxLength={120}
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
            />
          </label>
          <label
            className="text-foreground font-semibold"
            htmlFor="submitterEmail"
          >
            Email
            <input
              id="submitterEmail"
              name="submitterEmail"
              value={textFields.submitterEmail}
              onChange={(event) =>
                setTextFields((current) => ({
                  ...current,
                  submitterEmail: event.target.value,
                }))
              }
              required
              type="email"
              maxLength={254}
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
            />
          </label>
        </div>
        <label
          className="text-foreground block font-semibold"
          htmlFor="relationshipToHabitat"
        >
          Your relationship to Habitat
          <input
            id="relationshipToHabitat"
            name="relationshipToHabitat"
            value={textFields.relationshipToHabitat}
            onChange={(event) =>
              setTextFields((current) => ({
                ...current,
                relationshipToHabitat: event.target.value,
              }))
            }
            required
            maxLength={160}
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
          />
        </label>
        <label
          className="text-foreground block font-semibold"
          htmlFor="suggestedTitle"
        >
          Suggested title{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
          <input
            id="suggestedTitle"
            name="suggestedTitle"
            value={textFields.suggestedTitle}
            onChange={(event) =>
              setTextFields((current) => ({
                ...current,
                suggestedTitle: event.target.value,
              }))
            }
            maxLength={160}
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
          />
        </label>
        <label
          className="text-foreground block font-semibold"
          htmlFor="storyText"
        >
          Story text
          <p
            id="storyText-help"
            className="text-muted-foreground mt-1 text-sm font-normal"
          >
            Plain text only, 50–12,000 characters. Please tell us what you would
            like Habitat to understand.
          </p>
          <textarea
            id="storyText"
            name="storyText"
            value={textFields.storyText}
            onChange={(event) =>
              setTextFields((current) => ({
                ...current,
                storyText: event.target.value,
              }))
            }
            required
            minLength={50}
            maxLength={12000}
            rows={10}
            aria-describedby="storyText-help"
            className="border-input bg-surface mt-2 w-full rounded-sm border px-3 py-2 font-normal"
          />
        </label>
        <label
          className="text-foreground block font-semibold"
          htmlFor="publicationInterest"
        >
          <input
            id="publicationInterest"
            name="publicationInterest"
            value="true"
            checked={acknowledgments.publicationInterest}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                publicationInterest: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          I’m open to discussing publication.
          <span className="text-muted-foreground mt-1 block pl-7 text-sm font-normal">
            This is not publication consent.
          </span>
        </label>
      </section>
      <fieldset className="border-border space-y-4 border-t pt-7">
        <legend className="text-charcoal font-serif text-2xl">
          Before you send it
        </legend>
        <p className="text-muted-foreground text-sm">
          These acknowledgments help keep the intake private and clear.
        </p>
        <label className="block">
          <input
            id="contactConsent"
            required
            name="contactConsent"
            value="true"
            checked={acknowledgments.contactConsent}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                contactConsent: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          I agree that Fayette County Habitat may contact me about this
          submission.
        </label>
        <label className="block">
          <input
            id="editorialReviewAcknowledged"
            required
            name="editorialReviewAcknowledged"
            value="true"
            checked={acknowledgments.editorialReviewAcknowledged}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                editorialReviewAcknowledged: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          I understand this will be reviewed by Habitat staff and is not
          automatically published.
        </label>
        <label className="block">
          <input
            id="sensitiveDataWarningAcknowledged"
            required
            name="sensitiveDataWarningAcknowledged"
            value="true"
            checked={acknowledgments.sensitiveDataWarningAcknowledged}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                sensitiveDataWarningAcknowledged: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          I understand not to include highly sensitive information such as SSNs,
          financial, medical, password, or exact private-address details.
        </label>
        <label className="block">
          <input
            id="privacyNoticeAcknowledged"
            required
            name="privacyNoticeAcknowledged"
            value="true"
            checked={acknowledgments.privacyNoticeAcknowledged}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                privacyNoticeAcknowledged: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          I have read and acknowledge the current privacy notice.
        </label>
        <label className="block">
          <input
            name="involvesMinor"
            value="true"
            checked={acknowledgments.involvesMinor}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                involvesMinor: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          This story mentions a minor.
        </label>
        <label className="block">
          <input
            name="involvesHomeownerOrApplicant"
            value="true"
            checked={acknowledgments.involvesHomeownerOrApplicant}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                involvesHomeownerOrApplicant: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          This story mentions a homeowner or applicant.
        </label>
        <label className="block">
          <input
            name="containsSensitivePersonalCircumstances"
            value="true"
            checked={acknowledgments.containsSensitivePersonalCircumstances}
            onChange={(event) =>
              setAcknowledgments((current) => ({
                ...current,
                containsSensitivePersonalCircumstances: event.target.checked,
              }))
            }
            type="checkbox"
            className="mr-3 size-4 align-middle"
          />
          This story includes sensitive personal circumstances.
        </label>
      </fieldset>
      <section aria-labelledby="image-heading" className="space-y-6">
        <div>
          <h2 id="image-heading" className="text-charcoal font-serif text-3xl">
            Images{" "}
            <span className="text-muted-foreground font-sans text-base font-normal">
              (optional)
            </span>
          </h2>
          <p className="text-muted-foreground mt-2 leading-7">
            You may add up to 10 JPG, PNG, WebP, or HEIC/HEIF images. Each image
            is limited to 10 MB; all images together are limited to 60 MB.
            Images upload privately as you choose them.
          </p>
        </div>
        <label
          className={`border-border bg-surface block border-y p-5 ${uploadDisabled ? "opacity-60" : "cursor-pointer"}`}
          htmlFor="storyImages"
        >
          <span className="font-semibold">Add images</span>
          <span className="text-muted-foreground mt-1 block text-sm">
            No image is required. Do not add images you do not have rights to
            submit.
          </span>
          <input
            id="storyImages"
            type="file"
            multiple
            accept={accepted}
            disabled={uploadDisabled || !attempt}
            onChange={selectFiles}
            className="mt-4 block w-full text-sm"
          />
        </label>
        <div aria-live="polite" className="space-y-6">
          {visibleMedia.map((media) => {
            const retainedIndex = retained.findIndex(
              (item) => item.id === media.id,
            );
            const isRetained = retainedIndex >= 0;
            return (
              <fieldset
                key={media.id}
                className="border-border space-y-4 border-y py-5"
              >
                <legend className="font-semibold">
                  Image {isRetained ? retainedIndex + 1 : ""}:{" "}
                  {statusLabel(media)}
                  {isRetained && retainedIndex === 0 ? " · Suggested lead" : ""}
                </legend>
                {media.previewUrl ? (
                  // Object URLs are short-lived private browser previews, not remote image sources.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.previewUrl}
                    alt=""
                    className="max-h-52 w-auto"
                  />
                ) : null}
                <p className="text-muted-foreground text-sm">
                  {media.message ??
                    (media.technicalStatus === "READY"
                      ? "This image is ready for confidential review."
                      : "This image is being checked privately.")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => moveMedia(retainedIndex, -1)}
                    disabled={!isRetained || retainedIndex === 0 || mediaBusy}
                  >
                    Move earlier
                  </Button>
                  <Button
                    type="button"
                    onClick={() => moveMedia(retainedIndex, 1)}
                    disabled={
                      !isRetained ||
                      retainedIndex === retained.length - 1 ||
                      mediaBusy
                    }
                  >
                    Move later
                  </Button>
                  <Button
                    type="button"
                    onClick={() => removeMedia(media)}
                    disabled={mediaBusy}
                  >
                    Remove
                  </Button>
                </div>
                <label
                  className="block text-sm font-semibold"
                  htmlFor={`description-${media.id}`}
                >
                  Private description
                  <input
                    id={`description-${media.id}`}
                    maxLength={SUBMISSION_MEDIA_MAX_DESCRIPTION_LENGTH}
                    defaultValue={media.description ?? ""}
                    onBlur={(event) =>
                      updateMetadata(media, { description: event.target.value })
                    }
                    className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor={`credit-${media.id}`}
                >
                  Suggested photo credit{" "}
                  <span className="font-normal">(optional)</span>
                  <input
                    id={`credit-${media.id}`}
                    maxLength={SUBMISSION_MEDIA_MAX_CREDIT_LENGTH}
                    defaultValue={media.suggestedPhotoCredit ?? ""}
                    onBlur={(event) =>
                      updateMetadata(media, {
                        suggestedPhotoCredit: event.target.value,
                      })
                    }
                    className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2 font-normal"
                  />
                </label>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">
                    About this image
                  </legend>
                  <p className="text-muted-foreground text-sm">
                    These are sensitivity declarations for review, not consent
                    to publish.
                  </p>
                  {(
                    [
                      "involvesMinor",
                      "involvesHomeownerOrApplicant",
                      "involvesOtherIdentifiablePerson",
                      "depictsPrivateResidence",
                      "containsSensitivePersonalCircumstances",
                    ] as const
                  ).map((key) => (
                    <label key={key} className="block text-sm">
                      <input
                        type="checkbox"
                        checked={media.sensitivity[key]}
                        onChange={(event) =>
                          updateMetadata(media, {
                            sensitivity: {
                              ...media.sensitivity,
                              [key]: event.target.checked,
                            },
                          })
                        }
                        className="mr-3 size-4 align-middle"
                      />
                      {key === "involvesMinor"
                        ? "This image involves a minor."
                        : key === "involvesHomeownerOrApplicant"
                          ? "This image involves a homeowner or applicant."
                          : key === "involvesOtherIdentifiablePerson"
                            ? "This image includes another identifiable person."
                            : key === "depictsPrivateResidence"
                              ? "This image depicts a private residence."
                              : "This image includes sensitive personal circumstances."}
                    </label>
                  ))}
                </fieldset>
              </fieldset>
            );
          })}
        </div>
        {mediaFeedback ? (
          <p
            role={mediaFeedback.kind === "error" ? "alert" : "status"}
            className={
              mediaFeedback.kind === "error"
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {mediaFeedback.message}
          </p>
        ) : null}
        {retained.length > 0 ? (
          <fieldset className="border-border space-y-4 border-t pt-6">
            <legend className="text-charcoal font-serif text-2xl">
              Image permissions
            </legend>
            <label className="block">
              <input
                required={retained.length > 0}
                name="rightsDeclarationAccepted"
                value="true"
                type="checkbox"
                checked={imageRights}
                onChange={(event) => setImageRights(event.target.checked)}
                className="mr-3 size-4 align-middle"
              />
              I confirm that I have the right to submit these images for
              confidential Habitat review, and understand that submission does
              not automatically publish them or replace any additional releases
              that may be required.
            </label>
            <label className="block">
              <input
                name="submitterLikenessConsentAccepted"
                value="true"
                type="checkbox"
                checked={likenessConsent}
                onChange={(event) => setLikenessConsent(event.target.checked)}
                className="mr-3 size-4 align-middle"
              />
              I give permission for Habitat to discuss my likeness if I appear
              in an image I submit. This applies only to me, not to anyone else
              pictured.
            </label>
          </fieldset>
        ) : null}
      </section>
      <input
        type="text"
        name="honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px opacity-0"
      />
      <Button
        type="submit"
        disabled={
          pending ||
          mediaBusy ||
          !ready ||
          (retained.length > 0 && !imageRights)
        }
      >
        {pending ? "Sending…" : "Send my story"}
      </Button>
    </form>
  );
}
