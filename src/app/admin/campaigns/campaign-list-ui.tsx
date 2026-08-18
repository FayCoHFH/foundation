"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CampaignAdminListItem } from "@/modules/communications/campaigns";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  formattedCampaignDate,
  formatCampaignAmount,
} from "./campaign-constants";

export function CampaignListUI({
  campaigns,
}: {
  campaigns: readonly CampaignAdminListItem[];
}) {
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [workflow, setWorkflow] = useState("ALL");
  const filtered = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (type === "ALL" || campaign.campaignType === type) &&
          (status === "ALL" || campaign.campaignStatus === status) &&
          (workflow === "ALL" || campaign.workflow === workflow),
      ),
    [campaigns, type, status, workflow],
  );
  return (
    <>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <label>
          <span className="font-semibold">Campaign type</span>
          <select
            aria-label="Filter by Campaign type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All types</option>
            {Object.entries(CAMPAIGN_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Campaign status</span>
          <select
            aria-label="Filter by Campaign status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(CAMPAIGN_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Editorial workflow</span>
          <select
            aria-label="Filter by editorial workflow"
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
            className="border-input bg-surface mt-1 min-h-11 w-full rounded-sm border px-3 py-2"
          >
            <option value="ALL">All workflow states</option>
            {[
              "DRAFT",
              "CHANGES_REQUESTED",
              "IN_REVIEW",
              "PENDING_APPROVAL",
              "APPROVED",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        Showing {filtered.length} of {campaigns.length} Campaigns.
      </p>
      {filtered.length ? (
        <div className="border-border mt-4 overflow-x-auto border">
          <table className="w-full min-w-[66rem] text-left text-sm">
            <caption className="sr-only">Campaign drafts</caption>
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Type / status</th>
                <th className="px-4 py-3">Workflow / release</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((campaign) => (
                <tr
                  key={campaign.campaignId}
                  className="border-border border-t"
                >
                  <td className="px-4 py-4">
                    <Link
                      className="font-semibold underline"
                      href={`/admin/campaigns/${campaign.campaignId}`}
                    >
                      {campaign.title}
                    </Link>
                    {campaign.hasSuccessorDraft ? (
                      <span className="text-muted-foreground mt-1 block text-xs">
                        Successor draft; public release remains unchanged
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {CAMPAIGN_TYPE_LABELS[campaign.campaignType]}
                    <br />
                    {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]}
                  </td>
                  <td className="px-4 py-4">
                    {campaign.workflow.replaceAll("_", " ")}
                    <br />
                    {campaign.releaseState.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-4">
                    {formattedCampaignDate(campaign.startsAt) ?? "—"}
                    {campaign.endsAt
                      ? ` – ${formattedCampaignDate(campaign.endsAt)}`
                      : ""}
                  </td>
                  <td className="px-4 py-4">
                    {campaign.progressAmountCents !== null
                      ? formatCampaignAmount(
                          campaign.progressAmountCents,
                          campaign.currencyCode ?? "USD",
                        )
                      : "—"}
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {campaign.linkedProjectCount} linked Project
                      {campaign.linkedProjectCount === 1 ? "" : "s"} ·{" "}
                      {campaign.actionCount} action
                      {campaign.actionCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {campaign.updatedAt.toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-border mt-4 border p-6">
          No Campaign drafts match these filters.
        </p>
      )}
    </>
  );
}
