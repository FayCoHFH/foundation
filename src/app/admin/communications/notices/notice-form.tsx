"use client";

import { useActionState, useEffect, useRef } from "react";

import type { SiteNoticeAdmin } from "@/modules/communications/notices";
import { formatEditorialDateTimeInput } from "@/platform/time/editorial";

import {
  EMPTY_NOTICE_FORM_VALUES,
  SITE_NOTICE_SEVERITIES,
  SITE_NOTICE_TARGET_AREAS,
  noticeSeverityLabel,
  noticeTargetLabel,
  type NoticeFormState,
  type NoticeFormValues,
} from "./form-contract";
type NoticeAction = (
  previousState: NoticeFormState,
  formData: FormData,
) => Promise<NoticeFormState>;

const initialState: NoticeFormState = {
  status: "idle",
  values: EMPTY_NOTICE_FORM_VALUES,
};

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="text-foreground block font-semibold">
        {label}
      </label>
      {help ? (
        <p id={helpId} className="text-muted-foreground mt-1 text-sm">
          {help}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={errorId} className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
      {describedBy ? null : null}
    </div>
  );
}

function inputProps(
  id: string,
  error: string | undefined,
  help?: string,
): { id: string; "aria-invalid"?: true; "aria-describedby"?: string } {
  const describedBy = [
    help ? `${id}-help` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  };
}

export function NoticeForm({
  action,
  defaults = EMPTY_NOTICE_FORM_VALUES,
  hidden,
  submitLabel = "Save Site Notice draft",
}: {
  action: NoticeAction;
  defaults?: NoticeFormValues;
  hidden?: { noticeId: string; expectedVersion: number };
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    ...initialState,
    values: defaults,
  });
  const summaryRef = useRef<HTMLDivElement>(null);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state.status]);

  const values = state.status === "error" ? state.values : defaults;
  const textClass =
    "border-input bg-surface text-foreground min-h-11 w-full rounded-sm border px-3 py-2";
  const field = (name: keyof NoticeFormValues) => errors[name];

  return (
    <form action={formAction} className="mt-8 max-w-3xl space-y-7" noValidate>
      {hidden ? (
        <>
          <input type="hidden" name="noticeId" value={hidden.noticeId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={hidden.expectedVersion}
          />
        </>
      ) : null}
      {state.status === "error" ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          aria-labelledby="site-notice-error-title"
          className="border-destructive text-destructive border-l-4 pl-4"
        >
          <p id="site-notice-error-title" className="font-semibold">
            Site Notice not saved
          </p>
          <p className="mt-1 text-sm">{state.message}</p>
          {Object.entries(errors).length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {Object.entries(errors).map(([name, message]) => (
                <li key={name}>
                  <a className="font-semibold underline" href={`#${name}`}>
                    Review {name}: {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Field
        id="title"
        label="Title"
        help="Required before publishing; 160 characters maximum."
        error={field("title")}
      >
        <input
          {...inputProps(
            "title",
            field("title"),
            "Title is required before publishing; 160 characters maximum.",
          )}
          name="title"
          maxLength={160}
          defaultValue={values.title}
          className={textClass}
        />
      </Field>
      <Field
        id="message"
        label="Message"
        help="Plain text only; required before publishing and limited to 500 characters."
        error={field("message")}
      >
        <textarea
          {...inputProps(
            "message",
            field("message"),
            "Plain text only; required before publishing and limited to 500 characters.",
          )}
          name="message"
          maxLength={500}
          rows={5}
          defaultValue={values.message}
          className={`${textClass} min-h-32`}
        />
      </Field>
      <div className="grid gap-7 sm:grid-cols-2">
        <Field id="severity" label="Severity" error={field("severity")}>
          <select
            {...inputProps("severity", field("severity"))}
            name="severity"
            defaultValue={values.severity}
            className={textClass}
          >
            {SITE_NOTICE_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {noticeSeverityLabel(severity)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="targetArea"
          label="Target area"
          help="Choose where this operational message belongs."
          error={field("targetArea")}
        >
          <select
            {...inputProps(
              "targetArea",
              field("targetArea"),
              "Choose where this operational message belongs.",
            )}
            name="targetArea"
            defaultValue={values.targetArea}
            className={textClass}
          >
            {SITE_NOTICE_TARGET_AREAS.map((targetArea) => (
              <option key={targetArea} value={targetArea}>
                {noticeTargetLabel(targetArea)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="border-border border-t pt-6">
        <legend className="font-semibold">Activation window</legend>
        <p className="text-muted-foreground mt-1 text-sm">
          Central Time (America/Chicago). Published notices require both times;
          the end must be after the start.
        </p>
        <div className="mt-4 grid gap-7 sm:grid-cols-2">
          <Field id="startsAt" label="Starts" error={field("startsAt")}>
            <input
              {...inputProps("startsAt", field("startsAt"))}
              name="startsAt"
              type="datetime-local"
              defaultValue={values.startsAt}
              className={textClass}
            />
          </Field>
          <Field id="endsAt" label="Ends" error={field("endsAt")}>
            <input
              {...inputProps("endsAt", field("endsAt"))}
              name="endsAt"
              type="datetime-local"
              defaultValue={values.endsAt}
              className={textClass}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="border-border border-t pt-6">
        <legend className="font-semibold">Optional call to action</legend>
        <p className="text-muted-foreground mt-1 text-sm">
          Provide both a link label and an internal or HTTPS destination, or
          leave both blank.
        </p>
        <div className="mt-4 grid gap-7 sm:grid-cols-2">
          <Field id="ctaLabel" label="CTA label" error={field("ctaLabel")}>
            <input
              {...inputProps("ctaLabel", field("ctaLabel"))}
              name="ctaLabel"
              maxLength={80}
              defaultValue={values.ctaLabel}
              className={textClass}
            />
          </Field>
          <Field id="ctaUrl" label="CTA URL" error={field("ctaUrl")}>
            <input
              {...inputProps("ctaUrl", field("ctaUrl"))}
              name="ctaUrl"
              type="url"
              maxLength={2048}
              defaultValue={values.ctaUrl}
              className={textClass}
            />
          </Field>
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {hidden ? (
        <p className="text-muted-foreground text-sm">
          The current version is checked when this form is submitted.
        </p>
      ) : null}
    </form>
  );
}

export function noticeDefaults(notice: SiteNoticeAdmin): NoticeFormValues {
  return {
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    targetArea: notice.targetArea,
    startsAt: formatEditorialDateTimeInput(notice.startsAt),
    endsAt: formatEditorialDateTimeInput(notice.endsAt),
    ctaLabel: notice.ctaLabel ?? "",
    ctaUrl: notice.ctaUrl ?? "",
  };
}
