"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createDestinationAction,
  updateDestinationAction,
  type DestinationActionState,
  verifyDestinationAction,
  deactivateDestinationAction,
  assignCanonicalDestinationAction,
} from "./actions";
import {
  DONORVIEW_PURPOSE_LABELS,
  DONORVIEW_PURPOSES,
  type DonorViewDestinationAdmin,
  type DonorViewDestinationOption,
  type EngagementConfigurationReadModel,
} from "@/modules/engagement/donorview-destination-content";

const idle: DestinationActionState = { status: "idle" };

function ActionStatus({ state }: { state: DestinationActionState }) {
  return state.message ? (
    <p
      className={
        state.status === "error"
          ? "text-destructive mt-3 text-sm"
          : "text-primary mt-3 text-sm"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  ) : null;
}

function GlobalAssignment({
  purpose,
  currentId,
  version,
  options,
  canConfigure,
}: {
  purpose: "GENERAL_DONATE" | "GENERAL_VOLUNTEER";
  currentId: string | null;
  version: number;
  options: readonly DonorViewDestinationOption[];
  canConfigure: boolean;
}) {
  return (
    <form
      action={assignCanonicalDestinationAction}
      className="border-border border-t py-5"
    >
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="expectedVersion" value={version} />
      <label className="block max-w-2xl">
        <span className="font-semibold">
          {DONORVIEW_PURPOSE_LABELS[purpose]}
        </span>
        <select
          name="destinationId"
          defaultValue={currentId ?? ""}
          disabled={!canConfigure}
          className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
        >
          <option value="">Not configured</option>
          {options
            .filter((option) => option.purpose === purpose)
            .map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.pageReference ? ` · ${option.pageReference}` : ""}
              </option>
            ))}
        </select>
      </label>
      <p className="text-muted-foreground mt-2 text-sm">
        Only an active, verified destination can be used publicly. Clearing this
        assignment removes the public CTA without deleting destination history.
      </p>
      {canConfigure ? (
        <Button type="submit" className="mt-3">
          Save canonical destination
        </Button>
      ) : null}
    </form>
  );
}

function DestinationEditor({
  destination,
  canConfigure,
}: {
  destination: DonorViewDestinationAdmin;
  canConfigure: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateDestinationAction,
    idle,
  );
  return (
    <form action={action} className="border-border mt-5 border-t pt-5">
      <input type="hidden" name="id" value={destination.id} />
      <input type="hidden" name="expectedVersion" value={destination.version} />
      <input type="hidden" name="purpose" value={destination.purpose} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="font-semibold">Administrative label</span>
          <input
            name="label"
            defaultValue={destination.label}
            disabled={!canConfigure}
            maxLength={120}
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
          />
        </label>
        <label>
          <span className="font-semibold">DonorView page/reference label</span>
          <input
            name="pageReference"
            defaultValue={destination.pageReference ?? ""}
            disabled={!canConfigure}
            maxLength={160}
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="font-semibold">Approved HTTPS URL</span>
          <input
            name="url"
            type="url"
            defaultValue={destination.url}
            disabled={!canConfigure}
            maxLength={2048}
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
          />
        </label>
      </div>
      {canConfigure ? (
        <Button type="submit" disabled={pending} className="mt-4">
          {pending ? "Saving…" : "Save destination"}
        </Button>
      ) : null}
      <ActionStatus state={state} />
    </form>
  );
}

function DestinationRow({
  destination,
  canConfigure,
}: {
  destination: DonorViewDestinationAdmin;
  canConfigure: boolean;
}) {
  return (
    <li className="border-border border-t py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold">
            {destination.purposeLabel} · {destination.statusLabel}
          </p>
          <h2 className="mt-1 font-serif text-2xl">{destination.label}</h2>
          <p className="text-muted-foreground mt-2 text-sm break-all">
            {destination.url}
          </p>
          {destination.pageReference ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Reference: {destination.pageReference}
            </p>
          ) : null}
        </div>
        <dl className="text-sm">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-semibold">{destination.version}</dd>
          </div>
          <div className="mt-2">
            <dt className="text-muted-foreground">Public uses</dt>
            <dd className="font-semibold">
              {Number(destination.usage.globalDonate) +
                Number(destination.usage.globalVolunteer) +
                destination.usage.campaigns.length}
            </dd>
          </div>
        </dl>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer font-semibold">
          Review usage and manage destination
        </summary>
        <div className="mt-4">
          <p className="text-muted-foreground text-sm">
            Global Donate: {destination.usage.globalDonate ? "Yes" : "No"} ·
            Global Volunteer: {destination.usage.globalVolunteer ? "Yes" : "No"}
          </p>
          {destination.usage.campaigns.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {destination.usage.campaigns.map((campaign) => (
                <li key={`${campaign.campaignId}-${campaign.actionType}`}>
                  {campaign.title} ·{" "}
                  {campaign.actionType === "DONATE" ? "Donate" : "Volunteer"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              No Campaign actions use this destination.
            </p>
          )}
          <DestinationEditor
            destination={destination}
            canConfigure={canConfigure}
          />
          {canConfigure ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={verifyDestinationAction}>
                <input type="hidden" name="id" value={destination.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={destination.version}
                />
                <Button type="submit">Verify destination</Button>
              </form>
              {destination.status !== "INACTIVE" ? (
                <form action={deactivateDestinationAction}>
                  <input type="hidden" name="id" value={destination.id} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={destination.version}
                  />
                  <Button
                    type="submit"
                    className="bg-surface !text-foreground border-border border"
                  >
                    Deactivate destination
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export function DestinationManagementUI({
  destinations,
  configuration,
  canConfigure,
}: {
  destinations: readonly DonorViewDestinationAdmin[];
  configuration: EngagementConfigurationReadModel;
  canConfigure: boolean;
}) {
  const [state, action, pending] = useActionState(
    createDestinationAction,
    idle,
  );
  const options = destinations
    .filter((destination) => destination.status === "VERIFIED")
    .map(
      (destination) =>
        ({
          id: destination.id,
          purpose: destination.purpose,
          label: destination.label,
          pageReference: destination.pageReference,
          urlHost: destination.host,
        }) satisfies DonorViewDestinationOption,
    );
  return (
    <div className="mt-8 space-y-12">
      <section aria-labelledby="global-destinations-heading">
        <h2 id="global-destinations-heading" className="font-serif text-3xl">
          Global entry points
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          These are the organization-wide Donate and Volunteer handoffs. They
          remain absent from the public shell until a verified destination is
          deliberately assigned.
        </p>
        <div className="mt-5">
          <GlobalAssignment
            purpose="GENERAL_DONATE"
            currentId={configuration.generalDonateDestinationId}
            version={configuration.version}
            options={options}
            canConfigure={canConfigure}
          />
          <GlobalAssignment
            purpose="GENERAL_VOLUNTEER"
            currentId={configuration.generalVolunteerDestinationId}
            version={configuration.version}
            options={options}
            canConfigure={canConfigure}
          />
        </div>
      </section>

      {canConfigure ? (
        <section aria-labelledby="new-destination-heading">
          <h2 id="new-destination-heading" className="font-serif text-3xl">
            Add a DonorView destination
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Store the reviewed public handoff first. A human administrator must
            verify it before it can be assigned or attached to a Campaign.
          </p>
          <form action={action} className="mt-5 max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="font-semibold">Purpose</span>
                <select
                  name="purpose"
                  className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
                >
                  {DONORVIEW_PURPOSES.map((value) => (
                    <option key={value} value={value}>
                      {DONORVIEW_PURPOSE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="font-semibold">Administrative label</span>
                <input
                  name="label"
                  required
                  maxLength={120}
                  className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="font-semibold">DonorView HTTPS URL</span>
                <input
                  name="url"
                  type="url"
                  required
                  maxLength={2048}
                  className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="font-semibold">
                  Page/reference label{" "}
                  <span className="font-normal">(optional)</span>
                </span>
                <input
                  name="pageReference"
                  maxLength={160}
                  className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
                />
              </label>
            </div>
            <Button type="submit" disabled={pending} className="mt-4">
              {pending ? "Saving…" : "Save unverified destination"}
            </Button>
            <ActionStatus state={state} />
          </form>
        </section>
      ) : null}

      <section aria-labelledby="destination-list-heading">
        <h2 id="destination-list-heading" className="font-serif text-3xl">
          Managed destinations
        </h2>
        {destinations.length ? (
          <ul className="mt-4">
            {destinations.map((destination) => (
              <DestinationRow
                key={destination.id}
                destination={destination}
                canConfigure={canConfigure}
              />
            ))}
          </ul>
        ) : (
          <p className="border-border mt-4 max-w-2xl border p-5 text-sm">
            No DonorView destinations have been recorded.
          </p>
        )}
      </section>
    </div>
  );
}
