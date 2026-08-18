import Link from "next/link";
import type { PublicCampaign } from "@/modules/communications/campaigns";
import { StoryBody, type StoryNode } from "@/components/editorial/story-body";
import {
  CAMPAIGN_ACTION_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  formattedCampaignDate,
  formatCampaignAmount,
  progressPercent,
} from "@/app/admin/campaigns/campaign-constants";

function CampaignPeriod({ campaign }: { campaign: PublicCampaign }) {
  if (!campaign.startsAt && !campaign.endsAt) return null;
  return (
    <p className="text-muted-foreground mt-3 text-sm">
      {campaign.startsAt
        ? `Starts ${formattedCampaignDate(campaign.startsAt)}`
        : ""}
      {campaign.endsAt
        ? `${campaign.startsAt ? " · " : ""}Ends ${formattedCampaignDate(campaign.endsAt)}`
        : ""}
    </p>
  );
}

export function CampaignActions({ campaign }: { campaign: PublicCampaign }) {
  return campaign.actions.length ? (
    <ul className="mt-7 flex flex-wrap gap-3" aria-label="Campaign actions">
      {campaign.actions.map((action) => (
        <li key={`${action.actionType}-${action.sortOrder}`}>
          <a
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold underline-offset-4 hover:underline"
            href={action.destination}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${action.label} (${CAMPAIGN_ACTION_LABELS[action.actionType]} opens an external destination)`}
          >
            {action.label}
            <span aria-hidden="true" className="ml-2">
              ↗
            </span>
          </a>
        </li>
      ))}
    </ul>
  ) : null;
}

export function CampaignProgress({ campaign }: { campaign: PublicCampaign }) {
  const hasAmounts =
    campaign.goalAmountCents !== null || campaign.progressAmountCents !== null;
  if (!hasAmounts) return null;
  const progress =
    campaign.progressAmountCents !== null
      ? formatCampaignAmount(
          campaign.progressAmountCents,
          campaign.currencyCode ?? "USD",
        )
      : "Not yet reported";
  const goal =
    campaign.goalAmountCents !== null
      ? formatCampaignAmount(
          campaign.goalAmountCents,
          campaign.currencyCode ?? "USD",
        )
      : null;
  const percent = progressPercent(
    campaign.goalAmountCents,
    campaign.progressAmountCents,
  );
  return (
    <section
      aria-labelledby="campaign-progress-heading"
      className="border-primary/40 bg-surface-subtle mt-10 border-l-4 p-5"
    >
      <h2 id="campaign-progress-heading" className="font-serif text-2xl">
        Campaign progress
      </h2>
      {campaign.goalStatement ? (
        <p className="text-muted-foreground mt-2">{campaign.goalStatement}</p>
      ) : null}
      <p className="mt-4 text-2xl font-semibold">
        {progress}
        {goal ? (
          <span className="text-muted-foreground text-base font-normal">
            {" "}
            of {goal} goal
          </span>
        ) : null}
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        Editorial public-display figures. DonorView remains the authoritative
        donation system.
      </p>
      {percent !== null ? (
        <div className="mt-4">
          <div className="sr-only">
            {progress} of {goal}; {percent}% of the editorial goal.
          </div>
          <div
            aria-hidden="true"
            className="bg-border h-3 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {percent}% of goal shown; actual progress may exceed the goal.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function CampaignFacts({ facts }: { facts: PublicCampaign["facts"] }) {
  return facts.length ? (
    <dl className="mt-8 grid gap-4 sm:grid-cols-2">
      {facts.map((fact) => (
        <div
          key={`${fact.sortOrder}-${fact.label}`}
          className="border-border border-l-2 pl-4"
        >
          <dt className="text-muted-foreground text-sm">{fact.label}</dt>
          <dd className="mt-1 font-semibold">
            {fact.value}
            {fact.unit ? ` ${fact.unit}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  ) : null;
}

export function CampaignProjectLinks({
  campaign,
}: {
  campaign: PublicCampaign;
}) {
  return campaign.projects.length ? (
    <section aria-labelledby="campaign-projects-heading" className="mt-12">
      <h2 id="campaign-projects-heading" className="font-serif text-3xl">
        Projects connected to this purpose
      </h2>
      <ul className="mt-3">
        {campaign.projects.map((project) => (
          <li key={project.slug} className="border-border border-t py-5">
            <Link
              className="decoration-primary/40 text-lg font-semibold underline underline-offset-4"
              href={`/projects/${project.slug}`}
            >
              {project.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}

export function CampaignCard({ campaign }: { campaign: PublicCampaign }) {
  return (
    <li className="border-border border-t py-7">
      <article>
        <p className="text-primary text-sm font-semibold">
          {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]} ·{" "}
          {CAMPAIGN_TYPE_LABELS[campaign.campaignType]}
        </p>
        <h2 className="mt-2 font-serif text-2xl">
          <Link
            className="decoration-primary/40 underline underline-offset-4"
            href={`/campaigns/${campaign.slug}`}
          >
            {campaign.title}
          </Link>
        </h2>
        <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
          {campaign.summary}
        </p>
        <CampaignPeriod campaign={campaign} />
        {campaign.progressAmountCents !== null ? (
          <p className="mt-3 text-sm font-semibold">
            {formatCampaignAmount(
              campaign.progressAmountCents,
              campaign.currencyCode ?? "USD",
            )}{" "}
            campaign progress
          </p>
        ) : null}
      </article>
    </li>
  );
}

export function CampaignDetail({ campaign }: { campaign: PublicCampaign }) {
  return (
    <>
      <p className="text-primary text-sm font-semibold">
        {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]} ·{" "}
        {CAMPAIGN_TYPE_LABELS[campaign.campaignType]}
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
        {campaign.title}
      </h1>
      <p className="text-muted-foreground mt-5 max-w-3xl text-xl leading-8">
        {campaign.summary}
      </p>
      <CampaignPeriod campaign={campaign} />
      <CampaignActions campaign={campaign} />
      <div className="mt-10 max-w-3xl">
        <StoryBody node={campaign.body.root as StoryNode} />
      </div>
      <CampaignProgress campaign={campaign} />
      <CampaignFacts facts={campaign.facts} />
      <CampaignProjectLinks campaign={campaign} />
      <p className="text-muted-foreground mt-10 border-t pt-5 text-sm">
        Published {formattedCampaignDate(campaign.publishedAt)}
      </p>
    </>
  );
}
