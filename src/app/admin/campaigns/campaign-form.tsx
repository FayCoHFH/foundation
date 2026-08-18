"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createCampaignAction,
  saveCampaignRevisionAction,
  type CampaignActionState,
  type CampaignFormValues,
} from "./actions";
import { Button } from "@/components/ui/button";
import type {
  CampaignActionInput,
  CampaignProjectCandidate,
} from "@/modules/communications/campaigns";
import {
  CAMPAIGN_ACTION_LABELS,
  CAMPAIGN_ACTION_TYPES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  centsToDollars,
} from "./campaign-constants";

const empty: CampaignFormValues = {
  title: "",
  summary: "",
  campaignType: "FUNDRAISING",
  campaignStatus: "PLANNED",
  startsAt: "",
  endsAt: "",
  body: "",
  goalStatement: "",
  goalAmountDollars: "",
  progressAmountDollars: "",
  facts: [],
  projectIds: [],
  actions: [],
};

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

export function CampaignCreateForm({
  projects,
}: {
  projects: readonly CampaignProjectCandidate[];
}) {
  const [state, action, pending] = useActionState(createCampaignAction, {
    status: "idle",
    values: empty,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success" && state.campaignId)
      router.push(`/admin/campaigns/${state.campaignId}`);
  }, [router, state.status, state.campaignId]);
  return (
    <CampaignFields
      state={state}
      action={action}
      pending={pending}
      projects={projects}
      submitLabel="Create Campaign draft"
    />
  );
}

export function CampaignEditorForm({
  campaignId,
  expectedVersion,
  values,
  projects,
}: {
  campaignId: string;
  expectedVersion: number;
  values: CampaignFormValues;
  projects: readonly CampaignProjectCandidate[];
}) {
  const [state, action, pending] = useActionState(saveCampaignRevisionAction, {
    status: "idle",
    values,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <CampaignFields
      state={state}
      action={action}
      pending={pending}
      projects={projects}
      submitLabel="Save new Campaign revision"
      campaignId={campaignId}
      expectedVersion={expectedVersion}
    />
  );
}

export function CampaignFields({
  state,
  action,
  pending,
  submitLabel,
  campaignId,
  expectedVersion,
  projects,
}: {
  state: CampaignActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  campaignId?: string;
  expectedVersion?: number;
  projects: readonly CampaignProjectCandidate[];
}) {
  const [facts, setFacts] = useState(state.values.facts);
  const [projectIds, setProjectIds] = useState(state.values.projectIds);
  const [actions, setActions] = useState(state.values.actions);
  const [factDraft, setFactDraft] = useState({
    label: "",
    value: "",
    unit: "",
  });
  const [actionDraft, setActionDraft] = useState<CampaignActionInput>({
    actionType: "LEARN_MORE",
    label: "",
    destination: "",
    sortOrder: 0,
  });
  const errors = state.fieldErrors ?? {};
  const move = <T,>(
    items: T[],
    index: number,
    delta: number,
    update: (next: T[]) => void,
  ) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const current = next[index];
    const replacement = next[target];
    if (current === undefined || replacement === undefined) return;
    next[index] = replacement;
    next[target] = current;
    update(next);
  };
  const addFact = () => {
    if (
      !factDraft.label.trim() ||
      !factDraft.value.trim() ||
      facts.length >= 10
    )
      return;
    setFacts([
      ...facts,
      {
        ...factDraft,
        label: factDraft.label.trim(),
        value: factDraft.value.trim(),
        unit: factDraft.unit.trim(),
        sortOrder: facts.length,
      },
    ]);
    setFactDraft({ label: "", value: "", unit: "" });
  };
  const addAction = () => {
    if (
      !actionDraft.label.trim() ||
      !actionDraft.destination.trim() ||
      actions.length >= 5
    )
      return;
    setActions([
      ...actions,
      {
        ...actionDraft,
        label: actionDraft.label.trim(),
        destination: actionDraft.destination.trim(),
        sortOrder: actions.length,
      },
    ]);
    setActionDraft({
      actionType: "LEARN_MORE",
      label: "",
      destination: "",
      sortOrder: 0,
    });
  };
  const field = (name: keyof CampaignFormValues) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  const selectedProjects = projectIds
    .map((id) => projects.find((project) => project.projectId === id))
    .filter((project): project is CampaignProjectCandidate => Boolean(project));
  return (
    <form action={action} className="mt-8 max-w-5xl space-y-8" noValidate>
      {campaignId ? (
        <input type="hidden" name="campaignId" value={campaignId} />
      ) : null}
      {expectedVersion ? (
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
      ) : null}
      <input
        type="hidden"
        name="facts"
        value={JSON.stringify(
          facts.map((fact, sortOrder) => ({ ...fact, sortOrder })),
        )}
        readOnly
      />
      <input
        type="hidden"
        name="projectIds"
        value={JSON.stringify(projectIds)}
        readOnly
      />
      <input
        type="hidden"
        name="actions"
        value={JSON.stringify(
          actions.map((item, sortOrder) => ({ ...item, sortOrder })),
        )}
        readOnly
      />
      {state.status === "error" ? (
        <div
          className="border-destructive text-destructive border-l-4 pl-4"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">Campaign was not saved</p>
          <p className="mt-1 text-sm">{state.message}</p>
        </div>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="font-semibold">Campaign title</span>
          <input
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="title"
            required
            maxLength={160}
            defaultValue={state.values.title}
            {...field("title")}
          />
          {errors.title ? (
            <small id="title-error" className="text-destructive">
              {errors.title}
            </small>
          ) : null}
        </label>
        <label className="sm:col-span-2">
          <span className="font-semibold">Summary</span>
          <textarea
            className="border-input bg-surface mt-2 w-full rounded-sm border px-3 py-2"
            name="summary"
            rows={3}
            required
            maxLength={320}
            defaultValue={state.values.summary}
            {...field("summary")}
          />
          {errors.summary ? (
            <small id="summary-error" className="text-destructive">
              {errors.summary}
            </small>
          ) : null}
        </label>
        <label>
          <span className="font-semibold">Campaign type</span>
          <select
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="campaignType"
            defaultValue={state.values.campaignType}
          >
            {CAMPAIGN_TYPES.map((type) => (
              <option key={type} value={type}>
                {CAMPAIGN_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Campaign status</span>
          <select
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="campaignStatus"
            defaultValue={state.values.campaignStatus}
          >
            {CAMPAIGN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CAMPAIGN_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <small className="text-muted-foreground mt-1 block">
            Status describes the initiative; editorial workflow is managed
            separately.
          </small>
        </label>
        <label>
          <span className="font-semibold">
            Starts <span className="font-normal">(optional)</span>
          </span>
          <input
            type="date"
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="startsAt"
            defaultValue={state.values.startsAt}
          />
        </label>
        <label>
          <span className="font-semibold">
            Ends <span className="font-normal">(optional)</span>
          </span>
          <input
            type="date"
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="endsAt"
            defaultValue={state.values.endsAt}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="font-semibold">Public Campaign body</span>
          <textarea
            className="border-input bg-surface mt-2 w-full rounded-sm border px-3 py-2"
            name="body"
            rows={12}
            required
            defaultValue={state.values.body}
            {...field("body")}
          />
          <small className="text-muted-foreground mt-1 block">
            Keep donor, payment, volunteer, applicant, and private Project
            details out of this public-facing draft.
          </small>
          {errors.body ? (
            <small id="body-error" className="text-destructive">
              {errors.body}
            </small>
          ) : null}
        </label>
      </div>
      <fieldset className="border-border border-t pt-6">
        <legend className="text-xl font-semibold">Campaign progress</legend>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          These are editorial public-display figures. DonorView remains the
          authoritative donation system.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label>
            <span className="font-semibold">
              Goal statement <span className="font-normal">(optional)</span>
            </span>
            <input
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
              name="goalStatement"
              maxLength={240}
              defaultValue={state.values.goalStatement}
            />
          </label>
          <span className="hidden sm:block" aria-hidden="true" />
          <label>
            <span className="font-semibold">
              Goal amount in dollars{" "}
              <span className="font-normal">(optional)</span>
            </span>
            <input
              inputMode="decimal"
              placeholder="25000.00"
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
              name="goalAmountDollars"
              defaultValue={
                state.values.goalAmountDollars || centsToDollars(null)
              }
            />
          </label>
          <label>
            <span className="font-semibold">
              Progress amount in dollars{" "}
              <span className="font-normal">(optional)</span>
            </span>
            <input
              inputMode="decimal"
              placeholder="12500.00"
              className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
              name="progressAmountDollars"
              defaultValue={
                state.values.progressAmountDollars || centsToDollars(null)
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="border-border border-t pt-6">
        <legend className="text-xl font-semibold">
          Campaign facts{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (up to 10)
          </span>
        </legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
          <input
            aria-label="Fact label"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Label"
            value={factDraft.label}
            onChange={(event) =>
              setFactDraft({ ...factDraft, label: event.target.value })
            }
          />
          <input
            aria-label="Fact value"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Value"
            value={factDraft.value}
            onChange={(event) =>
              setFactDraft({ ...factDraft, value: event.target.value })
            }
          />
          <input
            aria-label="Fact unit"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Unit"
            value={factDraft.unit}
            onChange={(event) =>
              setFactDraft({ ...factDraft, unit: event.target.value })
            }
          />
          <Button type="button" onClick={addFact} disabled={facts.length >= 10}>
            Add fact
          </Button>
        </div>
        <ol className="mt-5 space-y-3">
          {facts.map((fact, index) => (
            <li
              key={`${fact.label}-${index}`}
              className="border-border flex flex-wrap items-center gap-3 border-b py-3"
            >
              <span className="min-w-0 flex-1">
                <strong>{fact.label}:</strong> {fact.value}
                {fact.unit ? ` ${fact.unit}` : ""}
              </span>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  move(facts, index, -1, (next) =>
                    setFacts(
                      next.map((item, sortOrder) => ({ ...item, sortOrder })),
                    ),
                  )
                }
                disabled={index === 0}
              >
                Move fact earlier
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  move(facts, index, 1, (next) =>
                    setFacts(
                      next.map((item, sortOrder) => ({ ...item, sortOrder })),
                    ),
                  )
                }
                disabled={index === facts.length - 1}
              >
                Move fact later
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  setFacts(
                    facts
                      .filter((_, itemIndex) => itemIndex !== index)
                      .map((item, sortOrder) => ({ ...item, sortOrder })),
                  )
                }
              >
                Remove fact
              </Button>
            </li>
          ))}
        </ol>
      </fieldset>
      <fieldset className="border-border border-t pt-6">
        <legend className="text-xl font-semibold">Linked Projects</legend>
        <p className="text-muted-foreground mt-2 text-sm">
          Choose exact public Project roots for this Campaign. Project content
          is not changed here.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <label
              key={project.projectId}
              className="border-border flex gap-3 border p-4"
            >
              <input
                type="checkbox"
                checked={projectIds.includes(project.projectId)}
                onChange={(event) =>
                  setProjectIds(
                    event.target.checked
                      ? [...projectIds, project.projectId]
                      : projectIds.filter((id) => id !== project.projectId),
                  )
                }
              />
              <span>
                <strong>{project.title}</strong>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {human(project.projectType)} · {human(project.projectStatus)}{" "}
                  · {human(project.releaseState)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {!projects.length ? (
          <p className="border-border mt-4 border p-4 text-sm">
            No authorized Project roots are available to link.
          </p>
        ) : null}
        {selectedProjects.length ? (
          <ol className="mt-5 space-y-3" aria-label="Selected Project order">
            {selectedProjects.map((project, index) => (
              <li
                key={project.projectId}
                className="border-border flex flex-wrap items-center gap-3 border-b py-3"
              >
                <span className="min-w-0 flex-1">
                  <strong>
                    {index + 1}. {project.title}
                  </strong>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {human(project.projectType)} ·{" "}
                    {human(project.projectStatus)}
                  </span>
                </span>
                <Button
                  type="button"
                  className="bg-surface !text-foreground border-border border"
                  onClick={() =>
                    move(selectedProjects, index, -1, (next) =>
                      setProjectIds(next.map((item) => item.projectId)),
                    )
                  }
                  disabled={index === 0}
                >
                  Move Project earlier
                </Button>
                <Button
                  type="button"
                  className="bg-surface !text-foreground border-border border"
                  onClick={() =>
                    move(selectedProjects, index, 1, (next) =>
                      setProjectIds(next.map((item) => item.projectId)),
                    )
                  }
                  disabled={index === selectedProjects.length - 1}
                >
                  Move Project later
                </Button>
              </li>
            ))}
          </ol>
        ) : null}
      </fieldset>
      <fieldset className="border-border border-t pt-6">
        <legend className="text-xl font-semibold">
          Public actions and handoffs{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (up to 5)
          </span>
        </legend>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Actions are plain approved HTTPS links. Donate and Volunteer
          destinations should point to the approved DonorView experience. No
          donor or volunteer data is collected here.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr_1.5fr_auto]">
          <select
            aria-label="Action type"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            value={actionDraft.actionType}
            onChange={(event) =>
              setActionDraft({
                ...actionDraft,
                actionType: event.target
                  .value as CampaignActionInput["actionType"],
              })
            }
          >
            {CAMPAIGN_ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {CAMPAIGN_ACTION_LABELS[type]}
              </option>
            ))}
          </select>
          <input
            aria-label="Action label"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Public label"
            value={actionDraft.label}
            onChange={(event) =>
              setActionDraft({ ...actionDraft, label: event.target.value })
            }
          />
          <input
            aria-label="Action HTTPS destination"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="https://approved.example.org/…"
            value={actionDraft.destination}
            onChange={(event) =>
              setActionDraft({
                ...actionDraft,
                destination: event.target.value,
              })
            }
          />
          <Button
            type="button"
            onClick={addAction}
            disabled={actions.length >= 5}
          >
            Add action
          </Button>
        </div>
        <ol className="mt-5 space-y-3">
          {actions.map((item, index) => (
            <li
              key={`${item.actionType}-${index}`}
              className="border-border flex flex-wrap items-center gap-3 border-b py-3"
            >
              <span className="min-w-0 flex-1">
                <strong>
                  {item.label || CAMPAIGN_ACTION_LABELS[item.actionType]}
                </strong>
                <span className="text-muted-foreground mt-1 block text-sm break-all">
                  {CAMPAIGN_ACTION_LABELS[item.actionType]} · {item.destination}
                </span>
              </span>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  move(actions, index, -1, (next) =>
                    setActions(
                      next.map((actionItem, sortOrder) => ({
                        ...actionItem,
                        sortOrder,
                      })),
                    ),
                  )
                }
                disabled={index === 0}
              >
                Move action earlier
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  move(actions, index, 1, (next) =>
                    setActions(
                      next.map((actionItem, sortOrder) => ({
                        ...actionItem,
                        sortOrder,
                      })),
                    ),
                  )
                }
                disabled={index === actions.length - 1}
              >
                Move action later
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() =>
                  setActions(
                    actions
                      .filter((_, itemIndex) => itemIndex !== index)
                      .map((actionItem, sortOrder) => ({
                        ...actionItem,
                        sortOrder,
                      })),
                  )
                }
              >
                Remove action
              </Button>
            </li>
          ))}
        </ol>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
