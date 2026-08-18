import Link from "next/link";

import type {
  PublicStorySubmissionAdminDetail,
  PublicStorySubmissionAdminListItem,
} from "@/modules/communications/submissions";
import { formatEditorialDateTime } from "@/platform/time/editorial";

import {
  submissionEmptyMessage,
  submissionHref,
  submissionStatusLabel,
  SUBMISSION_STATUS_OPTIONS,
  type SubmissionPageState,
} from "./query";
import {
  SUBMISSION_STATUS_MESSAGES,
  type SubmissionStatusCode,
} from "./status";
import { SubmissionReviewNoteForm } from "./review-note-form";
import { SubmissionWorkflowControls } from "./workflow-controls";
import { SubmissionMediaSummarySection } from "./media-ui";
import type { SubmissionMediaAdminSummary } from "@/modules/communications/submissions/submission-media-admin-service";

const SENSITIVITY_LABELS = [
  ["involvesMinor", "Minor involved"],
  ["involvesHomeownerOrApplicant", "Homeowner or applicant involved"],
  [
    "containsSensitivePersonalCircumstances",
    "Sensitive personal circumstances",
  ],
] as const;

type SensitivityRecord = Pick<
  PublicStorySubmissionAdminListItem,
  | "involvesMinor"
  | "involvesHomeownerOrApplicant"
  | "containsSensitivePersonalCircumstances"
>;

export function SubmissionSensitivityIndicators({
  submission,
}: {
  submission: SensitivityRecord;
}) {
  const indicators = SENSITIVITY_LABELS.filter(([key]) => submission[key]);
  if (!indicators.length) return null;
  return (
    <ul aria-label="Sensitivity indicators" className="grid gap-1 text-sm">
      {indicators.map(([, label]) => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  );
}

function SubmissionDates({
  submission,
}: {
  submission: Pick<
    PublicStorySubmissionAdminListItem,
    "receivedAt" | "updatedAt" | "statusChangedAt"
  >;
}) {
  return (
    <dl className="grid gap-2 text-sm sm:min-w-64">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <dt className="font-semibold">Received</dt>
        <dd>
          <time dateTime={submission.receivedAt.toISOString()}>
            {formatEditorialDateTime(submission.receivedAt)}
          </time>
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <dt className="font-semibold">Updated</dt>
        <dd>
          <time dateTime={submission.updatedAt.toISOString()}>
            {formatEditorialDateTime(submission.updatedAt)}
          </time>
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <dt className="font-semibold">Status changed</dt>
        <dd>
          <time dateTime={submission.statusChangedAt.toISOString()}>
            {formatEditorialDateTime(submission.statusChangedAt)}
          </time>
        </dd>
      </div>
    </dl>
  );
}

export function StorySubmissionsListContent({
  result,
  state,
  invalid,
  errorMessage,
}: {
  result: {
    items: readonly PublicStorySubmissionAdminListItem[];
    page: number;
    pageSize: number;
    total: number;
  } | null;
  state: SubmissionPageState;
  invalid: boolean;
  errorMessage?: string;
}) {
  const total = result?.total ?? 0;
  const pageCount = Math.max(
    1,
    Math.ceil(total / (result?.pageSize ?? state.pageSize)),
  );
  const page = result?.page ?? state.page;
  const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * state.pageSize, total);
  const previous =
    page > 1 ? submissionHref({ ...state, page: page - 1 }) : null;
  const next =
    page < pageCount ? submissionHref({ ...state, page: page + 1 }) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
            Communications
          </p>
          <h1 className="text-editorial-pecan mt-3 font-serif text-4xl">
            Story Submissions
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Confidential intake for authorized review. These submissions are not
            published Stories.
          </p>
        </div>
      </div>

      <aside
        aria-labelledby="submission-confidentiality-heading"
        className="border-border bg-surface-subtle mt-7 border-y px-4 py-4 sm:px-5"
      >
        <h2 id="submission-confidentiality-heading" className="font-semibold">
          Confidential intake
        </h2>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Publication interest is not publication consent. Do not copy sensitive
          information into public content. Sensitivity indicators require
          additional review before any future public use; they do not block
          confidential review or imply rejection or consent.
        </p>
      </aside>

      <form
        method="get"
        aria-label="Filter Story Submissions"
        className="border-border bg-surface-subtle mt-8 grid gap-4 border-y py-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_auto] sm:items-end"
      >
        <input type="hidden" name="page" value="1" />
        <label
          className="grid gap-1 text-sm font-semibold"
          htmlFor="submission-status"
        >
          Status
          <select
            id="submission-status"
            name="status"
            defaultValue={state.status ?? ""}
            className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
          >
            {SUBMISSION_STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="grid gap-1 text-sm font-semibold"
          htmlFor="submission-page-size"
        >
          Items per page
          <select
            id="submission-page-size"
            name="pageSize"
            defaultValue={String(state.pageSize)}
            className="border-border bg-surface min-h-11 rounded-sm border px-3 font-normal"
          >
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </label>
        <button
          type="submit"
          className="bg-primary text-primary-foreground min-h-11 rounded-sm px-4 font-semibold"
        >
          Apply filter
        </button>
      </form>

      {invalid ? (
        <p role="alert" className="text-destructive mt-5 font-semibold">
          That Story Submission link contains an invalid filter or page value.
          Choose a listed option and try again.
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-destructive mt-5 font-semibold">
          {errorMessage}
        </p>
      ) : null}

      {result && result.items.length ? (
        <>
          <div className="text-muted-foreground mt-8 flex flex-wrap justify-between gap-2 text-sm">
            <p>
              Showing{" "}
              <span className="text-foreground font-semibold">
                {start}–{end}
              </span>{" "}
              of {total}
            </p>
            <p>Ordered by received time, newest first.</p>
          </div>
          <ul className="border-border mt-3 divide-y border-y">
            {result.items.map((submission) => (
              <li
                key={submission.id}
                className="grid min-w-0 gap-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)] md:items-start md:gap-8"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
                    <span>{submissionStatusLabel(submission.status)}</span>
                    <SubmissionSensitivityIndicators submission={submission} />
                  </div>
                  <h2 className="text-editorial-pecan mt-2 font-serif text-2xl break-words">
                    <Link
                      href={`/admin/communications/submissions/${submission.id}`}
                      prefetch={false}
                      aria-label={`Review Story Submission from ${submission.submitterName}`}
                      className="underline underline-offset-4"
                    >
                      {submission.submitterName}
                    </Link>
                  </h2>
                  <dl className="text-muted-foreground mt-3 grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-6">
                    <div>
                      <dt className="inline font-semibold">Relationship: </dt>
                      <dd className="inline">
                        {submission.relationshipToHabitat}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">
                        Suggested title:{" "}
                      </dt>
                      <dd className="inline break-words">
                        {submission.suggestedTitle ?? "Not provided"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <SubmissionDates submission={submission} />
              </li>
            ))}
          </ul>
        </>
      ) : result ? (
        <div className="border-border mt-10 border-t pt-7">
          <h2 className="font-serif text-2xl">
            {submissionEmptyMessage(state.status)}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl">
            This view will update when matching confidential intake records are
            available.
          </p>
        </div>
      ) : null}

      {result && total > 0 ? (
        <nav
          aria-label="Story Submission pages"
          className="mt-8 flex flex-wrap items-center justify-between gap-4"
        >
          {previous ? (
            <Link
              href={previous}
              className="text-primary inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            >
              Previous page
            </Link>
          ) : (
            <span className="text-muted-foreground inline-flex min-h-11 items-center">
              Previous page
            </span>
          )}
          <p aria-current="page" className="text-sm font-semibold">
            Page {page} of {pageCount}
          </p>
          {next ? (
            <Link
              href={next}
              className="text-primary inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            >
              Next page
            </Link>
          ) : (
            <span className="text-muted-foreground inline-flex min-h-11 items-center">
              Next page
            </span>
          )}
        </nav>
      ) : null}
    </>
  );
}

export function submissionActionMessage(code: SubmissionStatusCode) {
  return SUBMISSION_STATUS_MESSAGES[code];
}

function StoryText({ text }: { text: string }) {
  const paragraphs = text.split(/\r?\n\r?\n+/);
  return (
    <div className="max-w-3xl space-y-5 leading-7">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`}>
          {paragraph.split(/\r?\n/).map((line, lineIndex) => (
            <span key={`${lineIndex}-${line.slice(0, 12)}`}>
              {line}
              {lineIndex < paragraph.split(/\r?\n/).length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export function StorySubmissionDetailContent({
  submission,
  statusCode,
  canRestoreSpam = false,
  mediaSummaries = [],
}: {
  submission: PublicStorySubmissionAdminDetail;
  statusCode?: SubmissionStatusCode;
  canRestoreSpam?: boolean;
  mediaSummaries?: readonly SubmissionMediaAdminSummary[];
}) {
  const hasSensitivity =
    submission.involvesMinor ||
    submission.involvesHomeownerOrApplicant ||
    submission.containsSensitivePersonalCircumstances;

  return (
    <>
      <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
        Communications / Story Submissions
      </p>
      <h1 className="text-editorial-pecan mt-3 font-serif text-4xl">
        Review Story Submission
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">
        Confidential intake record for authorized administrative review. This
        submission is not a published Story.
      </p>
      {statusCode ? (
        <p role="status" className="mt-5 font-semibold">
          {submissionActionMessage(statusCode)}
        </p>
      ) : null}

      <aside
        aria-labelledby="detail-confidentiality-heading"
        className="border-border bg-surface-subtle mt-7 border-y px-4 py-4 sm:px-5"
      >
        <h2 id="detail-confidentiality-heading" className="font-semibold">
          Confidential intake
        </h2>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Publication interest is not publication consent. Keep sensitive
          information out of public content. Sensitivity indicators require
          additional review before any future public use; they do not block
          confidential review or imply rejection or consent.
        </p>
      </aside>

      <section aria-labelledby="submission-contact-heading" className="mt-9">
        <h2 id="submission-contact-heading" className="font-serif text-2xl">
          Contact
        </h2>
        <dl className="border-border mt-4 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Submitter name</dt>
            <dd className="mt-1 break-words">{submission.submitterName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Email</dt>
            <dd className="mt-1 break-all">
              <a
                className="text-primary underline underline-offset-4"
                href={`mailto:${submission.submitterEmail}`}
              >
                {submission.submitterEmail}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Relationship to Habitat</dt>
            <dd className="mt-1 break-words">
              {submission.relationshipToHabitat}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Contact consent</dt>
            <dd className="mt-1">
              {submission.contactConsent ? "Granted" : "Not granted"}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="submission-content-heading" className="mt-9">
        <h2 id="submission-content-heading" className="font-serif text-2xl">
          Submission
        </h2>
        <dl className="border-border mt-4 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Suggested title</dt>
            <dd className="mt-1 break-words">
              {submission.suggestedTitle ?? "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Received</dt>
            <dd className="mt-1">
              {formatEditorialDateTime(submission.receivedAt)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Updated</dt>
            <dd className="mt-1">
              {formatEditorialDateTime(submission.updatedAt)}
            </dd>
          </div>
        </dl>
        <div className="border-border mt-6 border-l-4 pl-5">
          <h3 className="font-semibold">Story text</h3>
          <div className="mt-4">
            <StoryText text={submission.storyText} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="submission-acknowledgments-heading"
        className="mt-9"
      >
        <h2
          id="submission-acknowledgments-heading"
          className="font-serif text-2xl"
        >
          Acknowledgments
        </h2>
        <dl className="border-border mt-4 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Editorial review acknowledgment</dt>
            <dd className="mt-1">
              {submission.editorialReviewAcknowledged
                ? "Acknowledged"
                : "Not acknowledged"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Sensitive-data warning</dt>
            <dd className="mt-1">
              {submission.sensitiveDataWarningAcknowledged
                ? "Acknowledged"
                : "Not acknowledged"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Privacy notice version</dt>
            <dd className="mt-1 break-words">
              {submission.privacyNoticeVersion}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Privacy notice accepted</dt>
            <dd className="mt-1">
              {formatEditorialDateTime(submission.privacyNoticeAcceptedAt)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Publication interest</dt>
            <dd className="mt-1">
              {submission.publicationInterest === true
                ? "Open to discussing publication — this is not publication consent."
                : submission.publicationInterest === false
                  ? "No publication interest indicated."
                  : "Not indicated."}
            </dd>
          </div>
        </dl>
      </section>

      <SubmissionMediaSummarySection
        submissionId={submission.id}
        summaries={mediaSummaries}
      />

      <section
        aria-labelledby="submission-sensitivity-heading"
        className="mt-9"
      >
        <h2 id="submission-sensitivity-heading" className="font-serif text-2xl">
          Sensitivity
        </h2>
        <div className="border-border mt-4 border-y py-5 text-sm">
          {hasSensitivity ? (
            <SubmissionSensitivityIndicators submission={submission} />
          ) : (
            <p>
              No sensitivity declaration was recorded; this is not proof that
              the submission is safe.
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="submission-administration-heading"
        className="mt-9"
      >
        <h2
          id="submission-administration-heading"
          className="font-serif text-2xl"
        >
          Administrative review
        </h2>
        <dl className="border-border mt-4 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Lifecycle status</dt>
            <dd className="mt-1">
              {submissionStatusLabel(submission.status)}
              {submission.status === "ACCEPTED" ? (
                <span className="text-muted-foreground mt-1 block text-sm">
                  Accepted means accepted for editorial consideration. It does
                  not approve publication, complete consent, or clear rights.
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Status changed</dt>
            <dd className="mt-1">
              {formatEditorialDateTime(submission.statusChangedAt)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Status changed by</dt>
            <dd className="mt-1">
              {submission.statusChangedByDisplayName ?? "System receipt"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Current version</dt>
            <dd className="mt-1">{submission.version}</dd>
          </div>
        </dl>
        <SubmissionReviewNoteForm
          submissionId={submission.id}
          expectedVersion={submission.version}
          initialValue={submission.internalReviewNote ?? ""}
        />
      </section>

      <SubmissionWorkflowControls
        submissionId={submission.id}
        expectedVersion={submission.version}
        status={submission.status}
        canRestoreSpam={canRestoreSpam}
      />
    </>
  );
}
