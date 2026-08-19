import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  listCampaignProjectCandidates,
  getCampaignDraft,
} from "@/modules/communications/campaigns";
import { listCampaignDestinationOptions } from "@/modules/engagement";
import { storyDocumentToPlainText } from "@/modules/communications/stories";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  dateInputValue,
  centsToDollars,
} from "../campaign-constants";
import { CampaignEditorForm } from "../campaign-form";
import { CampaignWorkflowControls } from "../campaign-workflow-controls";

export const metadata: Metadata = { title: "Campaign draft" };

export default async function CampaignAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await resolveAdminAccess();
  const { id } = await params;
  if (access.status === "unauthenticated")
    redirect(`/admin/sign-in?next=%2Fadmin%2Fcampaigns%2F${id}`);
  if (access.status === "denied") redirect("/admin/access-denied");
  let campaign;
  try {
    campaign = await getCampaignDraft(prisma, access.principal, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const [projects, destinationOptions] = await Promise.all([
    listCampaignProjectCandidates(prisma, access.principal),
    listCampaignDestinationOptions(prisma, access.principal),
  ]);
  const canEdit =
    hasCapability(access.principal, "campaigns.edit.any") ||
    (hasCapability(access.principal, "campaigns.edit.own") &&
      campaign.editorialOwnerAdminUserId === access.principal.adminUserId);
  const values = {
    title: campaign.currentRevision.title,
    summary: campaign.currentRevision.summary,
    campaignType: campaign.currentRevision.campaignType,
    campaignStatus: campaign.currentRevision.campaignStatus,
    startsAt: dateInputValue(campaign.currentRevision.startsAt),
    endsAt: dateInputValue(campaign.currentRevision.endsAt),
    body: storyDocumentToPlainText(campaign.currentRevision.body),
    goalStatement: campaign.currentRevision.goalStatement ?? "",
    goalAmountDollars: centsToDollars(campaign.currentRevision.goalAmountCents),
    progressAmountDollars: centsToDollars(
      campaign.currentRevision.progressAmountCents,
    ),
    facts: campaign.currentRevision.facts.map((fact) => ({
      ...fact,
      unit: fact.unit ?? "",
    })),
    projectIds: [...campaign.currentRevision.projectIds],
    actions: [...campaign.currentRevision.actions],
  };
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/campaigns",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">
        <Link className="underline" href="/admin/campaigns">
          Campaigns
        </Link>{" "}
        · private draft
      </p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        {campaign.currentRevision.title}
      </h1>
      <dl className="border-border mt-7 grid gap-4 border-y py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Campaign type</dt>
          <dd className="mt-1 font-semibold">
            {CAMPAIGN_TYPE_LABELS[campaign.currentRevision.campaignType]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Campaign status</dt>
          <dd className="mt-1 font-semibold">
            {CAMPAIGN_STATUS_LABELS[campaign.currentRevision.campaignStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Editorial workflow</dt>
          <dd className="mt-1 font-semibold">
            {campaign.workflow.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public release</dt>
          <dd className="mt-1 font-semibold">
            {campaign.releaseState.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Editorial owner</dt>
          <dd className="mt-1 font-mono text-xs">
            {campaign.editorialOwnerAdminUserId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current revision</dt>
          <dd className="mt-1 font-semibold">
            Revision {campaign.currentRevision.number}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public snapshots</dt>
          <dd className="mt-1 font-semibold">{campaign.snapshotCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Actions</dt>
          <dd className="mt-1 font-semibold">
            {campaign.currentRevision.actions.length}
          </dd>
        </div>
      </dl>
      {campaign.releaseState === "PUBLISHED" &&
      campaign.workflow === "DRAFT" ? (
        <p className="border-primary bg-surface-subtle mt-6 border-l-4 p-4">
          This is a successor draft. The current public Campaign remains
          unchanged until this revision is released.
        </p>
      ) : null}
      {canEdit ? (
        <CampaignEditorForm
          campaignId={campaign.campaignId}
          expectedVersion={campaign.version}
          values={values}
          projects={projects}
          destinationOptions={destinationOptions}
        />
      ) : (
        <p className="text-muted-foreground mt-8">
          You can review this Campaign, but you do not have permission to edit
          it.
        </p>
      )}
      <CampaignWorkflowControls
        campaignId={campaign.campaignId}
        version={campaign.version}
        contentHash={campaign.currentRevision.contentHash}
        workflow={campaign.workflow}
        releaseState={campaign.releaseState}
        slug={campaign.slug}
        canSubmit={hasCapability(access.principal, "campaigns.submit_review")}
        canReview={hasCapability(access.principal, "campaigns.review")}
        canApprove={hasCapability(access.principal, "campaigns.approve")}
        canRelease={hasCapability(access.principal, "campaigns.release")}
        canWithdraw={hasCapability(access.principal, "campaigns.withdraw")}
        canArchive={hasCapability(access.principal, "campaigns.archive")}
      />
    </AdminShell>
  );
}
