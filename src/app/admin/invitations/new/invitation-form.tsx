"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createInvitationAction,
  type InvitationFormState,
} from "@/app/admin/invitations/new/actions";
import { Button } from "@/components/ui/button";

const initialState: InvitationFormState = {
  status: "idle",
  values: { email: "", roleKey: "", expiresAt: "" },
};

const fieldLabels = {
  email: "Google Workspace email",
  roleKey: "Initial role preset",
  expiresAt: "Invitation expiry",
} as const;

type InvitationFormProps = {
  roles: readonly { key: string; name: string }[];
};

export function InvitationForm({ roles }: InvitationFormProps) {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    initialState,
  );
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "error") {
      errorSummaryRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={action} className="mt-10 max-w-2xl space-y-7" noValidate>
      {state.status === "error" ? (
        <div
          ref={errorSummaryRef}
          className="border-destructive text-destructive border-l-4 pl-4"
          role="alert"
          tabIndex={-1}
          aria-labelledby="invitation-error-title"
        >
          <p id="invitation-error-title" className="font-semibold">
            Invitation not created
          </p>
          <p className="mt-1 text-sm">{state.message}</p>
          {state.fieldErrors ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {Object.entries(state.fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <a href={`#${field}`} className="font-semibold underline">
                    {fieldLabels[field as keyof typeof fieldLabels]}: {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="text-foreground block font-semibold">
          Google Workspace email
        </label>
        <p id="email-help" className="text-muted-foreground mt-1 text-sm">
          The address must exactly match the verified organizational Google
          account used at sign-in.
        </p>
        <input
          key={`email-${state.values.email}`}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values.email}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={
            fieldErrors.email ? "email-help email-error" : "email-help"
          }
          className="border-input bg-surface text-foreground mt-3 min-h-11 w-full rounded-sm border px-3 py-2"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-destructive mt-2 text-sm">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="roleKey"
          className="text-foreground block font-semibold"
        >
          Initial role preset
        </label>
        <p id="role-help" className="text-muted-foreground mt-1 text-sm">
          Presets materialize capabilities; application code does not authorize
          by role name.
        </p>
        <select
          key={`role-${state.values.roleKey}`}
          id="roleKey"
          name="roleKey"
          required
          defaultValue={state.values.roleKey}
          aria-invalid={fieldErrors.roleKey ? true : undefined}
          aria-describedby={
            fieldErrors.roleKey ? "role-help role-error" : "role-help"
          }
          className="border-input bg-surface text-foreground mt-3 min-h-11 w-full rounded-sm border px-3 py-2"
        >
          <option value="">Choose a role preset</option>
          {roles.map((role) => (
            <option key={role.key} value={role.key}>
              {role.name}
            </option>
          ))}
        </select>
        {fieldErrors.roleKey ? (
          <p id="role-error" className="text-destructive mt-2 text-sm">
            {fieldErrors.roleKey}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="expiresAt"
          className="text-foreground block font-semibold"
        >
          Invitation expiry
        </label>
        <p id="expiry-help" className="text-muted-foreground mt-1 text-sm">
          Choose a time between one hour and seven days from now. Times use
          Central Time (America/Chicago), including daylight saving changes.
        </p>
        <input
          key={`expiry-${state.values.expiresAt}`}
          id="expiresAt"
          name="expiresAt"
          type="datetime-local"
          required
          defaultValue={state.values.expiresAt}
          aria-invalid={fieldErrors.expiresAt ? true : undefined}
          aria-describedby={
            fieldErrors.expiresAt ? "expiry-help expiry-error" : "expiry-help"
          }
          className="border-input bg-surface text-foreground mt-3 min-h-11 w-full rounded-sm border px-3 py-2"
        />
        {fieldErrors.expiresAt ? (
          <p id="expiry-error" className="text-destructive mt-2 text-sm">
            {fieldErrors.expiresAt}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating invitation…" : "Create invitation"}
      </Button>

      {state.status === "success" && state.invitationUrl ? (
        <div
          className="bg-secondary text-secondary-foreground rounded-md p-5"
          role="status"
        >
          <p className="font-semibold">{state.message}</p>
          <label
            htmlFor="invitation-url"
            className="mt-4 block text-sm font-semibold"
          >
            One-time invitation link
          </label>
          <textarea
            id="invitation-url"
            readOnly
            value={state.invitationUrl}
            rows={4}
            className="border-border bg-surface text-foreground mt-2 w-full rounded-sm border p-3 text-sm"
          />
          <p className="mt-2 text-sm">
            Share this link through an approved private channel. It cannot be
            recovered from the database after leaving this page.
          </p>
        </div>
      ) : null}
    </form>
  );
}
