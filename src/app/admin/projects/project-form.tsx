"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createProjectAction,
  saveProjectRevisionAction,
  type ProjectActionState,
  type ProjectFormValues,
} from "@/app/admin/projects/actions";
import { Button } from "@/components/ui/button";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
} from "./project-constants";

const empty: ProjectFormValues = {
  title: "",
  summary: "",
  projectType: "NEW_HOME",
  projectStatus: "PLANNED",
  community: "",
  county: "Fayette County",
  publicArea: "",
  startDate: "",
  completionDate: "",
  body: "",
  impactFacts: [],
};

export function ProjectCreateForm() {
  const [state, action, pending] = useActionState(createProjectAction, {
    status: "idle",
    values: empty,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success" && state.projectId)
      router.push(`/admin/projects/${state.projectId}`);
  }, [router, state.status, state.projectId]);
  return (
    <ProjectFields
      state={state}
      action={action}
      pending={pending}
      submitLabel="Create Project draft"
    />
  );
}

export function ProjectEditorForm({
  projectId,
  expectedVersion,
  values,
}: {
  projectId: string;
  expectedVersion: number;
  values: ProjectFormValues;
}) {
  const [state, action, pending] = useActionState(saveProjectRevisionAction, {
    status: "idle",
    values,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <ProjectFields
      state={state}
      action={action}
      pending={pending}
      submitLabel="Save new Project revision"
      projectId={projectId}
      expectedVersion={expectedVersion}
    />
  );
}

export function ProjectFields({
  state,
  action,
  pending,
  submitLabel,
  projectId,
  expectedVersion,
}: {
  state: ProjectActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  projectId?: string;
  expectedVersion?: number;
}) {
  const [facts, setFacts] = useState(state.values.impactFacts);
  const [draft, setDraft] = useState({ label: "", value: "", unit: "" });
  const errors = state.fieldErrors ?? {};
  const addFact = () => {
    if (!draft.label.trim() || !draft.value.trim() || facts.length >= 10)
      return;
    setFacts([
      ...facts,
      {
        ...draft,
        label: draft.label.trim(),
        value: draft.value.trim(),
        unit: draft.unit.trim() || null,
        sortOrder: facts.length,
      },
    ]);
    setDraft({ label: "", value: "", unit: "" });
  };
  const move = (index: number, delta: number) => {
    const next = [...facts];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const replacement = next[target];
    if (!current || !replacement) return;
    next[index] = replacement;
    next[target] = current;
    setFacts(next.map((fact, sortOrder) => ({ ...fact, sortOrder })));
  };
  const remove = (index: number) =>
    setFacts(
      facts
        .filter((_, i) => i !== index)
        .map((fact, sortOrder) => ({ ...fact, sortOrder })),
    );
  const field = (name: keyof ProjectFormValues) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  return (
    <form action={action} className="mt-8 max-w-4xl space-y-7" noValidate>
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}
      {expectedVersion ? (
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
      ) : null}
      <input
        type="hidden"
        name="impactFacts"
        value={JSON.stringify(
          facts.map((fact, sortOrder) => ({ ...fact, sortOrder })),
        )}
        readOnly
      />
      {state.status === "error" ? (
        <div
          className="border-destructive text-destructive border-l-4 pl-4"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">Project was not saved</p>
          <p className="mt-1 text-sm">{state.message}</p>
        </div>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="font-semibold">Project title</span>
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
          <span className="font-semibold">Summary or deck</span>
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
          <span className="font-semibold">Project type</span>
          <select
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="projectType"
            defaultValue={state.values.projectType}
          >
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROJECT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Project status</span>
          <select
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="projectStatus"
            defaultValue={state.values.projectStatus}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <small className="text-muted-foreground mt-1 block">
            Project status describes the work; editorial workflow is managed
            separately below.
          </small>
        </label>
        <label>
          <span className="font-semibold">Community or city</span>
          <input
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="community"
            required
            maxLength={120}
            defaultValue={state.values.community}
            {...field("community")}
          />
        </label>
        <label>
          <span className="font-semibold">County</span>
          <input
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="county"
            required
            maxLength={120}
            defaultValue={state.values.county}
            {...field("county")}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="font-semibold">
            Public area <span className="font-normal">(optional)</span>
          </span>
          <input
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="publicArea"
            maxLength={160}
            defaultValue={state.values.publicArea}
          />
          <small className="text-muted-foreground mt-1 block">
            Use only location information appropriate for public display. Do not
            enter a homeowner’s private street address.
          </small>
        </label>
        <label>
          <span className="font-semibold">
            Start date <span className="font-normal">(optional)</span>
          </span>
          <input
            type="date"
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="startDate"
            defaultValue={state.values.startDate}
          />
        </label>
        <label>
          <span className="font-semibold">
            Completion date <span className="font-normal">(optional)</span>
          </span>
          <input
            type="date"
            className="border-input bg-surface mt-2 min-h-11 w-full rounded-sm border px-3 py-2"
            name="completionDate"
            defaultValue={state.values.completionDate}
          />
        </label>
      </div>
      <label className="block">
        <span className="font-semibold">Restricted Project body</span>
        <textarea
          className="border-input bg-surface mt-2 w-full rounded-sm border px-3 py-2"
          name="body"
          rows={12}
          required
          defaultValue={state.values.body}
          {...field("body")}
        />
        <small className="text-muted-foreground mt-1 block">
          Plain text is stored as a validated structured document. Keep private
          household details out of this public-facing draft.
        </small>
        {errors.body ? (
          <small id="body-error" className="text-destructive">
            {errors.body}
          </small>
        ) : null}
      </label>
      <fieldset className="border-border border-t pt-6">
        <legend className="text-xl font-semibold">
          Impact facts{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (up to 10)
          </span>
        </legend>
        <p className="text-muted-foreground mt-1 text-sm">
          Facts are shown as structured public information, not as a substitute
          for the Project narrative.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
          <input
            aria-label="Fact label"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            aria-label="Fact value"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Value"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <input
            aria-label="Fact unit"
            className="border-input bg-surface min-h-11 rounded-sm border px-3 py-2"
            placeholder="Unit"
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
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
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
                Move fact earlier
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() => move(index, 1)}
                disabled={index === facts.length - 1}
              >
                Move fact later
              </Button>
              <Button
                type="button"
                className="bg-surface !text-foreground border-border border"
                onClick={() => remove(index)}
              >
                Remove fact
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
