/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";

import {
  MediaAssetCreditTreatment,
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaSubjectType,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import type {
  SubmissionMediaAdminReview,
  SubmissionMediaAdminSummary,
} from "@/modules/communications/submissions/submission-media-admin-service";
import { eligibilityReasonLabel } from "@/modules/communications/submissions/submission-media-admin-service";
import {
  CLEARANCE_EVIDENCE_MAX_DOCUMENTS,
  CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES,
  CLEARANCE_EVIDENCE_MAX_PDF_BYTES,
  CLEARANCE_EVIDENCE_MAX_PDF_PAGES,
} from "@/modules/communications/submissions/submission-media-clearance-evidence-content";
import {
  createSubmissionMediaClearanceFormAction,
  createSubmissionMediaSubjectFormAction,
  updateSubmissionMediaClearanceFormAction,
  promoteSubmissionMediaFormAction,
  rejectSubmissionMediaClearanceFormAction,
  removeSubmissionClearanceEvidenceFormAction,
  restoreSubmissionMediaEligibilityFormAction,
  restrictSubmissionMediaFormAction,
  revokeSubmissionMediaClearanceFormAction,
  setSubmissionMediaClearanceApplicabilityFormAction,
  uploadSubmissionClearanceEvidenceFormAction,
  verifySubmissionMediaClearanceFormAction,
} from "./media-actions";

const clearanceLabels: Record<PublicStorySubmissionMediaClearanceType, string> =
  {
    IMAGE_RIGHTS: "Image rights",
    IDENTIFIABLE_ADULT: "Identifiable adult",
    MINOR_GUARDIAN: "Minor / guardian",
    HOMEOWNER_APPLICANT: "Homeowner / applicant",
    PRIVATE_RESIDENCE: "Private residence",
    SENSITIVE_CIRCUMSTANCES: "Sensitive circumstances",
    SUBMITTER_LIKENESS: "Submitter likeness",
  };

const subjectLabels: Record<PublicStorySubmissionMediaSubjectType, string> = {
  IDENTIFIABLE_ADULT: "Identifiable adult",
  MINOR: "Minor",
};

const evidenceLabels: Record<PublicStorySubmissionMediaEvidenceType, string> = {
  EXISTING_HABITAT_RELEASE: "Existing Habitat release",
  NEW_RELEASE: "New release",
  OTHER_APPROVED_AUTHORIZATION: "Other approved authorization",
  SUBMITTER_LIKENESS_CONSENT: "Submitter likeness consent",
  STAFF_PRIVACY_REVIEW: "Staff privacy review",
};

const evidenceStatusLabels: Record<string, string> = {
  PENDING_UPLOAD: "Uploading",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  READY: "Ready",
  REJECTED: "Rejected",
  REMOVED: "Removed",
};

const technicalStatusLabels: Record<string, string> = {
  PENDING_UPLOAD: "Processing",
  UPLOADED: "Processing",
  PROCESSING: "Processing",
  READY: "Ready for review",
  REJECTED: "Rejected during processing",
  REMOVED: "Removed by submitter",
};

function dateLabel(date: Date | null) {
  return date
    ? date.toLocaleDateString("en-US", { timeZone: "UTC" })
    : "Not provided";
}

function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^| )\S/gu, (letter) => letter.toUpperCase());
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-border mt-10 border-t pt-7">
      <h2
        id={id}
        className="type-display text-2xl text-[color:var(--color-brand-black)]"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function TextInput({
  name,
  defaultValue = "",
  required = false,
  type = "text",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <input
      name={name}
      defaultValue={defaultValue}
      required={required}
      type={type}
      className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
    />
  );
}

function MediaStatus({
  media,
}: {
  media: SubmissionMediaAdminSummary["media"];
}) {
  const sensitivity = [
    [media.sensitivity.involvesMinor, "Minor involved"],
    [
      media.sensitivity.involvesHomeownerOrApplicant,
      "Homeowner or applicant involved",
    ],
    [
      media.sensitivity.involvesOtherIdentifiablePerson,
      "Other identifiable person involved",
    ],
    [media.sensitivity.depictsPrivateResidence, "Private residence"],
    [
      media.sensitivity.containsSensitivePersonalCircumstances,
      "Sensitive personal circumstances",
    ],
  ] as const;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-semibold">Technical status</dt>
        <dd>
          {technicalStatusLabels[media.technicalStatus] ??
            statusLabel(media.technicalStatus)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Description</dt>
        <dd>{media.description ?? "Not provided"}</dd>
      </div>
      <div>
        <dt className="font-semibold">Suggested photo credit</dt>
        <dd>{media.suggestedPhotoCredit ?? "Not provided"}</dd>
      </div>
      <div>
        <dt className="font-semibold">Order</dt>
        <dd>
          {media.ordinal ?? "Not ordered"}
          {media.ordinal === 1 ? " — Suggested lead" : ""}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Technical dimensions</dt>
        <dd>
          {media.sourceWidth && media.sourceHeight
            ? `${media.sourceWidth} × ${media.sourceHeight}`
            : "Not available"}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="font-semibold">Sensitivity declarations</dt>
        <dd className="mt-1">
          <ul className="grid gap-1">
            {sensitivity.map(([declared, label]) => (
              <li key={label}>
                {declared ? `Declared: ${label}` : `Not declared: ${label}`}
              </li>
            ))}
          </ul>
        </dd>
      </div>
      {media.rejectionReason ? (
        <div className="sm:col-span-2">
          <dt className="font-semibold">Safe rejection reason</dt>
          <dd>{statusLabel(media.rejectionReason)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function SubmissionMediaSummarySection({
  submissionId,
  summaries,
}: {
  submissionId: string;
  summaries: readonly SubmissionMediaAdminSummary[];
}) {
  return (
    <Section id="submission-media-heading" title="Media review">
      {summaries.length === 0 ? (
        <p className="border-border text-muted-foreground border-y py-5 text-sm">
          No images were attached to this submission.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y border-y">
          {summaries.map(({ media, eligibility, restriction, promotion }) => (
            <li
              key={media.id}
              className="grid gap-5 py-6 sm:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <div>
                {media.technicalStatus === "READY" ? (
                  <img
                    src={`/admin/communications/submissions/${submissionId}/media/${media.id}/review-image`}
                    alt="Private review derivative of submitted image"
                    loading="lazy"
                    className="border-border aspect-[4/3] w-full border object-cover"
                  />
                ) : (
                  <div className="border-border text-muted-foreground flex aspect-[4/3] items-center justify-center border p-3 text-center text-xs">
                    No review image
                  </div>
                )}
              </div>
              <div>
                <p className="text-primary text-sm font-semibold uppercase">
                  Image {media.ordinal ?? "—"}
                  {media.ordinal === 1 ? " · Suggested lead" : ""}
                </p>
                <h3 className="type-display mt-1 text-xl">Submitted image</h3>
                <div className="mt-3">
                  <MediaStatus media={media} />
                </div>
                <p className="mt-4 text-sm">
                  {restriction.state === "ACTIVE"
                    ? "This image is restricted from new use."
                    : promotion
                      ? "Promoted to the sanitized Media Library."
                      : "Not promoted to the Media Library."}
                </p>
                <Link
                  href={`/admin/communications/submissions/${submissionId}/media/${media.id}`}
                  prefetch={false}
                  className="text-primary mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                >
                  Review image and clearance
                </Link>
                <div className="mt-4 grid gap-1 text-xs">
                  <p className="font-semibold">Public-use snapshot</p>
                  {eligibility.map((item) => (
                    <p key={item.proposedUse}>
                      {item.label}:{" "}
                      {item.eligible
                        ? "Eligible"
                        : item.reasons.map(eligibilityReasonLabel).join("; ")}
                    </p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function EvidenceBlock({
  submissionId,
  mediaId,
  clearance,
}: {
  submissionId: string;
  mediaId: string;
  clearance: SubmissionMediaAdminReview["clearances"][number];
}) {
  return (
    <div className="border-border border-t pt-4">
      <h4 className="font-semibold">Supporting evidence</h4>
      <p className="text-muted-foreground mt-1 text-sm">
        Routine review uses sanitized derivatives. Original access is a
        deliberate audited download.
      </p>
      <ul className="mt-3 grid gap-4">
        {clearance.evidence.length === 0 ? (
          <li className="text-muted-foreground text-sm">
            No evidence document attached.
          </li>
        ) : (
          clearance.evidence.map((evidence) => (
            <li
              key={evidence.id}
              className="border-border border-l-2 pl-4 text-sm"
            >
              <p className="font-semibold">
                {evidenceLabels[
                  clearance.evidenceType as PublicStorySubmissionMediaEvidenceType
                ] ?? "Evidence document"}{" "}
                ·{" "}
                {evidenceStatusLabels[evidence.technicalStatus] ??
                  statusLabel(evidence.technicalStatus)}
              </p>
              <p className="text-muted-foreground mt-1">
                {evidence.declaredFormat} · uploaded{" "}
                {dateLabel(evidence.createdAt)}
                {evidence.pageCount ? ` · ${evidence.pageCount} pages` : ""}
              </p>
              {evidence.rejectionReason ? (
                <p className="mt-1">
                  Safe rejection reason: {statusLabel(evidence.rejectionReason)}
                </p>
              ) : null}
              {evidence.replacesEvidenceDocumentId ? (
                <p className="mt-1">
                  Replacement of an earlier evidence record.
                </p>
              ) : null}
              {evidence.technicalStatus === "READY" ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {evidence.reviewPages.map((page) => (
                    <a
                      key={page.id}
                      href={`/admin/communications/submissions/${submissionId}/media/${mediaId}/evidence/${evidence.id}/page/${page.ordinal}`}
                      className="text-primary font-semibold underline underline-offset-4"
                    >
                      Review page {page.ordinal}
                    </a>
                  ))}
                  <a
                    href={`/admin/communications/submissions/${submissionId}/media/${mediaId}/evidence/${evidence.id}/original`}
                    className="text-primary font-semibold underline underline-offset-4"
                  >
                    Download original evidence
                  </a>
                </div>
              ) : null}
              {evidence.technicalStatus !== "REMOVED" ? (
                <form
                  action={removeSubmissionClearanceEvidenceFormAction}
                  className="mt-3"
                >
                  <input
                    type="hidden"
                    name="submissionId"
                    value={submissionId}
                  />
                  <input type="hidden" name="mediaId" value={mediaId} />
                  <input
                    type="hidden"
                    name="evidenceDocumentId"
                    value={evidence.id}
                  />
                  <input
                    type="hidden"
                    name="expectedEvidenceVersion"
                    value={evidence.version}
                  />
                  <button
                    type="submit"
                    className="text-destructive font-semibold underline underline-offset-4"
                  >
                    Remove evidence
                  </button>
                </form>
              ) : null}
              <form
                action={uploadSubmissionClearanceEvidenceFormAction}

                className="border-border mt-4 grid gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="submissionId" value={submissionId} />
                <input type="hidden" name="mediaId" value={mediaId} />
                <input type="hidden" name="clearanceId" value={clearance.id} />
                <input
                  type="hidden"
                  name="expectedClearanceVersion"
                  value={clearance.version}
                />
                <input
                  type="hidden"
                  name="replacesEvidenceDocumentId"
                  value={evidence.id}
                />
                <Field label="Upload replacement">
                  <input
                    name="evidenceFile"
                    type="file"
                    required
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="border-border min-h-11 rounded-sm border px-3 py-2 font-normal"
                  />
                </Field>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground min-h-11 self-end rounded-sm px-4 font-semibold"
                >
                  Upload replacement
                </button>
              </form>
            </li>
          ))
        )}
      </ul>
      <form
        action={uploadSubmissionClearanceEvidenceFormAction}

        className="border-border mt-5 grid gap-4 border-t pt-4"
      >
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="mediaId" value={mediaId} />
        <input type="hidden" name="clearanceId" value={clearance.id} />
        <input
          type="hidden"
          name="expectedClearanceVersion"
          value={clearance.version}
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
          <Field label="Evidence file">
            <input
              name="evidenceFile"
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="border-border min-h-11 rounded-sm border px-3 py-2 font-normal"
            />
          </Field>
          <Field label="Declared format">
            <select
              name="declaredMimeType"
              defaultValue="application/pdf"
              className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
            >
              <option value="application/pdf">PDF</option>
              <option value="image/jpeg">JPEG/JPG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
              <option value="image/heic">HEIC/HEIF</option>
            </select>
          </Field>
        </div>
        <p className="text-muted-foreground text-xs">
          Up to {CLEARANCE_EVIDENCE_MAX_DOCUMENTS} retained documents; images up
          to {CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES / 1024 / 1024} MB, PDFs up to{" "}
          {CLEARANCE_EVIDENCE_MAX_PDF_BYTES / 1024 / 1024} MB and{" "}
          {CLEARANCE_EVIDENCE_MAX_PDF_PAGES} pages.
        </p>
        <button
          type="submit"
          className="bg-primary text-primary-foreground min-h-11 justify-self-start rounded-sm px-4 font-semibold"
        >
          Upload evidence
        </button>
      </form>
    </div>
  );
}

function ClearanceBlock({
  review,
  clearance,
}: {
  review: SubmissionMediaAdminReview;
  clearance: SubmissionMediaAdminReview["clearances"][number];
}) {
  const applicable = clearance.applicableMediaIds.includes(
    review.media.media.id,
  );
  return (
    <li className="border-border border-y py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {clearanceLabels[clearance.clearanceType]}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {clearance.subject
              ? `Applies to ${clearance.subject.displayLabel}`
              : "No subject-specific clearance"}{" "}
            ·{" "}
            {applicable
              ? "Applies to this image"
              : "Not applicable to this image"}
          </p>
        </div>
        <p className="font-semibold">{statusLabel(clearance.status)}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Evidence type</dt>
          <dd>
            {clearance.evidenceType
              ? evidenceLabels[
                  clearance.evidenceType as PublicStorySubmissionMediaEvidenceType
                ]
              : "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Verified</dt>
          <dd>
            {clearance.dateVerified
              ? dateLabel(clearance.dateVerified)
              : "Not verified"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Expiration</dt>
          <dd>{dateLabel(clearance.expiresAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Usage permissions</dt>
          <dd>
            {[
              clearance.usage.websitePublicationAllowed &&
                "Website/publication",
              clearance.usage.socialMediaAllowed && "Social media",
              clearance.usage.printAllowed && "Print",
              clearance.usage.fundraisingPromotionalAllowed &&
                "Fundraising/promotional",
              clearance.usage.paidAdvertisingAllowed && "Paid advertising",
            ]
              .filter(Boolean)
              .join(", ") || "None recorded"}
          </dd>
        </div>
        {clearance.existingEvidenceReference ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold">
              Existing Habitat release reference
            </dt>
            <dd>
              Reference: {clearance.existingEvidenceReference}
              {clearance.existingEvidenceVersion
                ? ` · version ${clearance.existingEvidenceVersion}`
                : ""}
            </dd>
          </div>
        ) : null}
        {clearance.confidentialNote ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold">Confidential note</dt>
            <dd>{clearance.confidentialNote}</dd>
          </div>
        ) : null}
      </dl>
      <form
        action={updateSubmissionMediaClearanceFormAction}
        className="border-border mt-5 grid gap-4 border-t pt-4"
      >
        <input type="hidden" name="submissionId" value={review.submissionId} />
        <input type="hidden" name="mediaId" value={review.media.media.id} />
        <input type="hidden" name="clearanceId" value={clearance.id} />
        <input
          type="hidden"
          name="expectedClearanceVersion"
          value={clearance.version}
        />
        <p className="font-semibold">Edit clearance details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Evidence type">
            <select
              name="evidenceType"
              defaultValue={clearance.evidenceType ?? ""}
              className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
            >
              <option value="">Not recorded</option>
              {Object.entries(evidenceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date obtained">
            <TextInput
              name="dateObtained"
              type="date"
              defaultValue={dateInputValue(clearance.dateObtained)}
            />
          </Field>
          <Field label="Expiration (optional)">
            <TextInput
              name="expiresAt"
              type="date"
              defaultValue={dateInputValue(clearance.expiresAt)}
            />
          </Field>
          <Field label="Existing release reference (if applicable)">
            <TextInput
              name="existingEvidenceReference"
              defaultValue={clearance.existingEvidenceReference ?? ""}
            />
          </Field>
          <Field label="Release/version (if known)">
            <TextInput
              name="existingEvidenceVersion"
              defaultValue={clearance.existingEvidenceVersion ?? ""}
            />
          </Field>
        </div>
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-semibold">
            Structured usage permissions
          </legend>
          {[
            [
              "websitePublicationAllowed",
              "Website/publication",
              clearance.usage.websitePublicationAllowed,
            ],
            [
              "socialMediaAllowed",
              "Social media",
              clearance.usage.socialMediaAllowed,
            ],
            ["printAllowed", "Print", clearance.usage.printAllowed],
            [
              "fundraisingPromotionalAllowed",
              "Fundraising/promotional",
              clearance.usage.fundraisingPromotionalAllowed,
            ],
            [
              "paidAdvertisingAllowed",
              "Paid advertising",
              clearance.usage.paidAdvertisingAllowed,
            ],
          ].map(([name, label, enabled]) => (
            <label key={name as string} className="flex items-center gap-2">
              <input
                type="checkbox"
                name={name as string}
                defaultChecked={enabled as boolean}
              />{" "}
              {label as string}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="otherRestrictionsPresent"
            defaultChecked={clearance.otherRestrictionsPresent}
          />
          Other restrictions present
        </label>
        <Field label="Confidential note">
          <textarea
            name="confidentialNote"
            defaultValue={clearance.confidentialNote ?? ""}
            maxLength={1000}
            className="border-border bg-surface min-h-24 rounded-sm border px-3 py-2 font-normal"
          />
        </Field>
        <Field label="Confidential restrictions note">
          <textarea
            name="confidentialRestrictionsNote"
            defaultValue={clearance.confidentialRestrictionsNote ?? ""}
            maxLength={1000}
            className="border-border bg-surface min-h-24 rounded-sm border px-3 py-2 font-normal"
          />
        </Field>
        <button
          type="submit"
          className="border-border min-h-11 justify-self-start rounded-sm border px-4 font-semibold"
        >
          Save clearance details
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-3">
        <form action={verifySubmissionMediaClearanceFormAction}>
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={review.media.media.id} />
          <input type="hidden" name="clearanceId" value={clearance.id} />
          <input
            type="hidden"
            name="expectedClearanceVersion"
            value={clearance.version}
          />
          <label
            className="sr-only"
            htmlFor={`verification-evidence-${clearance.id}`}
          >
            Verification evidence
          </label>
          <select
            id={`verification-evidence-${clearance.id}`}
            name="evidenceDocumentId"
            defaultValue=""
            className="border-border bg-surface min-h-11 rounded-sm border px-3 text-sm"
          >
            <option value="">Use recorded/reference evidence</option>
            {clearance.evidence
              .filter((evidence) => evidence.technicalStatus === "READY")
              .map((evidence) => (
                <option key={evidence.id} value={evidence.id}>
                  Use uploaded document {evidence.id.slice(0, 8)}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={clearance.status === "VERIFIED"}
            className="bg-primary text-primary-foreground min-h-11 rounded-sm px-4 font-semibold disabled:opacity-50"
          >
            Verify clearance
          </button>
        </form>
        <form action={rejectSubmissionMediaClearanceFormAction}>
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={review.media.media.id} />
          <input type="hidden" name="clearanceId" value={clearance.id} />
          <input
            type="hidden"
            name="expectedClearanceVersion"
            value={clearance.version}
          />
          <button
            type="submit"
            disabled={clearance.status === "REJECTED"}
            className="border-border min-h-11 rounded-sm border px-4 font-semibold disabled:opacity-50"
          >
            Reject clearance
          </button>
        </form>
        {clearance.status === "VERIFIED" ? (
          <form action={revokeSubmissionMediaClearanceFormAction}>
            <input
              type="hidden"
              name="submissionId"
              value={review.submissionId}
            />
            <input type="hidden" name="mediaId" value={review.media.media.id} />
            <input type="hidden" name="clearanceId" value={clearance.id} />
            <input
              type="hidden"
              name="expectedClearanceVersion"
              value={clearance.version}
            />
            <input type="hidden" name="revocationReason" value="STAFF_REVIEW" />
            <button
              type="submit"
              className="border-border text-destructive min-h-11 rounded-sm border px-4 font-semibold"
            >
              Revoke clearance
            </button>
          </form>
        ) : null}
      </div>
      <EvidenceBlock
        submissionId={review.submissionId}
        mediaId={review.media.media.id}
        clearance={clearance}
      />
      <form
        action={setSubmissionMediaClearanceApplicabilityFormAction}
        className="border-border mt-5 grid gap-3 border-t pt-4"
      >
        <input type="hidden" name="submissionId" value={review.submissionId} />
        <input type="hidden" name="mediaId" value={review.media.media.id} />
        <input type="hidden" name="clearanceId" value={clearance.id} />
        <input
          type="hidden"
          name="expectedClearanceVersion"
          value={clearance.version}
        />
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-semibold">This clearance applies to:</legend>
          {review.availableMedia.map((available) => (
            <label key={available.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="applicableMediaIds"
                value={available.id}
                defaultChecked={clearance.applicableMediaIds.includes(
                  available.id,
                )}
              />{" "}
              Image {available.ordinal ?? "—"}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          className="border-border min-h-11 justify-self-start rounded-sm border px-4 font-semibold"
        >
          Save applicability
        </button>
      </form>
    </li>
  );
}

export function SubmissionMediaDetailContent({
  review,
  canPromote,
  canRestore,
}: {
  review: SubmissionMediaAdminReview;
  canPromote: boolean;
  canRestore: boolean;
}) {
  const { media, requiredClearances, eligibility, restriction, promotion } =
    review.media;
  const hasImageRights = requiredClearances.some(
    (requirement) => requirement.clearanceType === "IMAGE_RIGHTS",
  );
  const websiteEligibility = eligibility.find(
    (item) =>
      item.proposedUse === PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
  );
  const promotionReady =
    media.technicalStatus === "READY" &&
    restriction.state === "NONE" &&
    websiteEligibility?.eligible === true &&
    promotion === null;
  return (
    <>
      <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
        Communications / Story Submissions / Media
      </p>
      <h1 className="text-brand-black type-display mt-3 text-4xl">
        Review submitted image
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">
        Confidential administrative review. The submitted original remains
        private and is never rendered by this page.
      </p>
      <nav aria-label="Breadcrumb" className="mt-5 text-sm">
        <Link
          href="/admin/communications/submissions"
          prefetch={false}
          className="text-primary underline underline-offset-4"
        >
          Story Submissions
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={`/admin/communications/submissions/${review.submissionId}`}
          prefetch={false}
          className="text-primary underline underline-offset-4"
        >
          Submission detail
        </Link>
      </nav>

      <Section id="media-image-heading" title="Image">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
          <div>
            {media.technicalStatus === "READY" ? (
              <img
                src={`/admin/communications/submissions/${review.submissionId}/media/${media.id}/review-image`}
                alt="Private review derivative of submitted image"
                className="border-border max-h-[38rem] w-full border object-contain"
              />
            ) : (
              <p className="border-border text-muted-foreground border-y py-5">
                This image is not technically ready for review.
              </p>
            )}
          </div>
          <MediaStatus media={media} />
        </div>
      </Section>
      <Section id="media-contributor-heading" title="Contributor context">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Contributor description</dt>
            <dd>{media.description ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Suggested photo credit</dt>
            <dd>{media.suggestedPhotoCredit ?? "Not provided"}</dd>
          </div>
        </dl>
        <p className="text-muted-foreground mt-4 text-sm">
          Suggested photo credit is reference information, not a verified final
          public credit. Contributor description is editorial context, not alt
          text or a public caption.
        </p>
      </Section>
      <Section id="media-sensitivity-heading" title="Sensitivity declarations">
        <MediaStatus media={media} />
      </Section>
      <Section id="media-subjects-heading" title="Subjects">
        <p className="text-muted-foreground text-sm">
          Subjects identify who a clearance applies to. Staff must make image
          associations explicitly; no facial recognition or identity inference
          is used.
        </p>
        <ul className="mt-4 grid gap-3">
          {review.subjects
            .filter((subject) => subject.mediaIds.includes(media.id))
            .map((subject) => (
              <li key={subject.id} className="border-border border-y py-3">
                <p className="font-semibold">
                  {subjectLabels[
                    subject.subjectType as PublicStorySubmissionMediaSubjectType
                  ] ?? statusLabel(subject.subjectType)}{" "}
                  — {subject.displayLabel}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {subject.isSubmitter
                    ? "Submitter subject"
                    : "Scoped to this submission"}
                </p>
              </li>
            ))}
        </ul>
        <form
          action={createSubmissionMediaSubjectFormAction}
          className="border-border mt-5 grid gap-4 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]"
        >
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={media.id} />
          <Field label="Subject label">
            <TextInput name="displayLabel" required />
          </Field>
          <Field label="Subject type">
            <select
              name="subjectType"
              defaultValue="IDENTIFIABLE_ADULT"
              className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
            >
              <option value="IDENTIFIABLE_ADULT">Identifiable adult</option>
              <option value="MINOR">Minor</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isSubmitter" /> This is the submitter
            subject
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground min-h-11 justify-self-start rounded-sm px-4 font-semibold"
          >
            Add subject
          </button>
        </form>
      </Section>
      <Section
        id="media-clearance-requirements-heading"
        title="Clearance requirements"
      >
        <p className="text-muted-foreground text-sm">
          Requirements come from the authoritative rights evaluator and show
          what remains before a particular public use can be considered.
        </p>
        <ul className="mt-4 grid gap-2 text-sm">
          {requiredClearances.map((requirement, index) => (
            <li
              key={`${requirement.clearanceType}-${requirement.subjectId ?? "image"}-${index}`}
            >
              <span className="font-semibold">
                {clearanceLabels[requirement.clearanceType]}
              </span>
              {requirement.subjectId ? " — subject-specific" : " — image-level"}
            </li>
          ))}
        </ul>
      </Section>
      <Section id="media-clearances-heading" title="Clearances">
        <ul className="grid gap-5">
          {review.clearances.length ? (
            review.clearances.map((clearance) => (
              <ClearanceBlock
                key={clearance.id}
                review={review}
                clearance={clearance}
              />
            ))
          ) : (
            <li className="text-muted-foreground border-border border-y py-5 text-sm">
              No clearances have been created for this submission.
            </li>
          )}
        </ul>
        <form
          action={createSubmissionMediaClearanceFormAction}
          className="border-border mt-6 grid gap-4 border-t pt-5"
        >
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={media.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clearance type">
              <select
                name="clearanceType"
                defaultValue={
                  hasImageRights ? "IDENTIFIABLE_ADULT" : "IMAGE_RIGHTS"
                }
                className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
              >
                {Object.entries(clearanceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject (required for person clearances)">
              <select
                name="subjectId"
                defaultValue=""
                className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
              >
                <option value="">No subject</option>
                {review.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.displayLabel} —{" "}
                    {subjectLabels[
                      subject.subjectType as PublicStorySubmissionMediaSubjectType
                    ] ?? subject.subjectType}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Evidence type">
              <select
                name="evidenceType"
                defaultValue="NEW_RELEASE"
                className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
              >
                {Object.entries(evidenceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Existing release reference (if applicable)">
              <TextInput name="existingEvidenceReference" />
            </Field>
            <Field label="Release/version (if known)">
              <TextInput name="existingEvidenceVersion" />
            </Field>
            <Field label="Date obtained">
              <TextInput name="dateObtained" type="date" />
            </Field>
            <Field label="Expiration (optional)">
              <TextInput name="expiresAt" type="date" />
            </Field>
          </div>
          <fieldset className="grid gap-2 text-sm">
            <legend className="font-semibold">
              Structured usage permissions (all default unchecked)
            </legend>
            {[
              ["websitePublicationAllowed", "Website/publication"],
              ["socialMediaAllowed", "Social media"],
              ["printAllowed", "Print"],
              ["fundraisingPromotionalAllowed", "Fundraising/promotional"],
              ["paidAdvertisingAllowed", "Paid advertising"],
            ].map(([name, label]) => (
              <label key={name} className="flex items-center gap-2">
                <input type="checkbox" name={name} /> {label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="otherRestrictionsPresent" /> Other
            restrictions present
          </label>
          <Field label="Confidential note">
            <textarea
              name="confidentialNote"
              maxLength={1000}
              className="border-border bg-surface min-h-24 rounded-sm border px-3 py-2 font-normal"
            />
          </Field>
          <Field label="Confidential restrictions note">
            <textarea
              name="confidentialRestrictionsNote"
              maxLength={1000}
              className="border-border bg-surface min-h-24 rounded-sm border px-3 py-2 font-normal"
            />
          </Field>
          <button
            type="submit"
            className="bg-primary text-primary-foreground min-h-11 justify-self-start rounded-sm px-4 font-semibold"
          >
            Create clearance
          </button>
        </form>
      </Section>
      <Section id="media-eligibility-heading" title="Public-use eligibility">
        <ul className="border-border divide-border divide-y border-y">
          {eligibility.map((item) => (
            <li
              key={item.proposedUse}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,14rem)_auto]"
            >
              <p className="font-semibold">{item.label}</p>
              <p>
                {item.eligible
                  ? "Eligible"
                  : `Not eligible — ${item.reasons.map(eligibilityReasonLabel).join("; ")}`}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-4 text-sm">
          Technical readiness does not mean cleared or publishable. Eligibility
          is evaluated by the server for each use.
        </p>
      </Section>
      <Section id="media-restrictions-heading" title="Restrictions">
        <p className="text-muted-foreground text-sm">
          Restriction prevents new use and does not automatically rewrite
          existing publications.
        </p>
        {restriction.state === "ACTIVE" ? (
          <form
            action={restoreSubmissionMediaEligibilityFormAction}
            className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,14rem)_auto]"
          >
            <input
              type="hidden"
              name="submissionId"
              value={review.submissionId}
            />
            <input type="hidden" name="mediaId" value={media.id} />
            <input
              type="hidden"
              name="expectedRestrictionVersion"
              value={restriction.version ?? ""}
            />
            <Field label="Restore for proposed use">
              <select
                name="proposedUse"
                defaultValue={PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION}
                className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
              >
                {Object.entries({
                  WEBSITE_PUBLICATION: "Website/publication",
                  SOCIAL_MEDIA: "Social media",
                  PRINT: "Print",
                  FUNDRAISING_PROMOTIONAL: "Fundraising/promotional",
                  PAID_ADVERTISING: "Paid advertising",
                }).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {canRestore ? (
              <button
                type="submit"
                className="bg-primary text-primary-foreground min-h-11 self-end rounded-sm px-4 font-semibold"
              >
                Restore eligibility
              </button>
            ) : (
              <p className="text-muted-foreground self-end text-sm">
                Restoration requires the higher media restoration capability.
              </p>
            )}
          </form>
        ) : null}
        <form
          action={restrictSubmissionMediaFormAction}
          className="border-border mt-5 grid gap-4 border-t pt-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
        >
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={media.id} />
          <input
            type="hidden"
            name="expectedRestrictionVersion"
            value={restriction.version ?? ""}
          />
          <Field label="Reason">
            <select
              name="reason"
              defaultValue="STAFF_REVIEW_REQUIRED"
              className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
            >
              {Object.entries({
                CLEARANCE_EXPIRED: "Clearance expired",
                CLEARANCE_REVOKED: "Clearance revoked",
                CLEARANCE_INSUFFICIENT: "Clearance insufficient",
                PRIVACY_CONCERN: "Privacy concern",
                SUBJECT_REVOCATION_REQUEST: "Subject revocation request",
                STAFF_REVIEW_REQUIRED: "Staff review required",
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Confidential note">
            <TextInput name="confidentialNote" />
          </Field>
          <button
            type="submit"
            className="border-border min-h-11 self-end rounded-sm border px-4 font-semibold"
          >
            Restrict media
          </button>
        </form>
      </Section>
      <Section id="media-credit-heading" title="Public credit">
        <p className="text-muted-foreground text-sm">
          Contributor-suggested credit remains separate. Choose the final
          public-credit treatment explicitly.
        </p>
        <form
          action={promoteSubmissionMediaFormAction}
          className="mt-4 grid gap-4"
        >
          <input
            type="hidden"
            name="submissionId"
            value={review.submissionId}
          />
          <input type="hidden" name="mediaId" value={media.id} />
          <input
            type="hidden"
            name="expectedMediaVersion"
            value={media.version}
          />
          <Field label="Credit treatment">
            <select
              name="creditTreatment"
              defaultValue={MediaAssetCreditTreatment.NO_PUBLIC_CREDIT}
              className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
            >
              <option value="VERIFIED_CREDIT">Verified credit</option>
              <option value="ORGANIZATIONAL_CREDIT">
                Organizational credit
              </option>
              <option value="NO_PUBLIC_CREDIT">No public credit</option>
            </select>
          </Field>
          <Field label="Final public credit (required for the first two treatments)">
            <TextInput name="publicCredit" />
          </Field>
          <fieldset className="border-border grid gap-2 border-y py-4 text-sm">
            <legend className="font-semibold">Promotion checklist</legend>
            <p>
              {media.technicalStatus === "READY"
                ? "✓ Technical image status Ready"
                : "Not ready: technical image processing must be Ready"}
            </p>
            <p>
              {websiteEligibility?.eligible
                ? "✓ Website/publication eligibility satisfied"
                : `Not eligible: ${websiteEligibility?.reasons.map(eligibilityReasonLabel).join("; ") ?? "eligibility could not be established"}`}
            </p>
            <p>
              {restriction.state === "NONE"
                ? "✓ No active restriction"
                : "Blocked: media has an active restriction"}
            </p>
            <p>
              ✓ Public-credit treatment is selected explicitly when submitted
            </p>
            <p>
              {requiredClearances.length
                ? "✓ Required clearances are evaluated by the server"
                : "Blocked: required clearances are not established"}
            </p>
          </fieldset>
          {promotion ? (
            <p className="text-sm">
              Promoted asset: {promotion.assetId} ·{" "}
              {statusLabel(promotion.lifecycle)} ·{" "}
              {promotion.publicCredit ?? "No public credit"}
            </p>
          ) : canPromote ? (
            <button
              type="submit"
              disabled={!promotionReady}
              className="bg-primary text-primary-foreground min-h-11 justify-self-start rounded-sm px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Promote to Media Library
            </button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Promotion requires communications.media.promote.
            </p>
          )}
        </form>
        {promotion ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Promotion creates a sanitized public asset. It does not insert this
            image into a Story or other publication.
          </p>
        ) : null}
      </Section>
      {promotion ? (
        <Section id="media-existing-uses-heading" title="Existing uses">
          <p className="text-muted-foreground text-sm">
            When rights become restricted, existing public uses are reviewed
            separately; they are not silently rewritten.
          </p>
          {review.existingUses.length ? (
            <ul className="mt-3 grid gap-2 text-sm">
              {review.existingUses.map((use) => (
                <li key={use.id}>
                  {statusLabel(use.usageType)} · {statusLabel(use.subjectType)}{" "}
                  · {dateLabel(use.createdAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm">No existing uses recorded.</p>
          )}
        </Section>
      ) : null}
    </>
  );
}
