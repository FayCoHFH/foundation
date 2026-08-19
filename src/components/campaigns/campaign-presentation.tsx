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
  if (!campaign.actions.length) return null;
  const hasDonate = campaign.actions.some(
    (action) => action.actionType === "DONATE",
  );
  const hasVolunteer = campaign.actions.some(
    (action) => action.actionType === "VOLUNTEER",
  );
  return (
    <div className="mt-7">
      <ul className="flex flex-wrap gap-3" aria-label="Campaign actions">
        {campaign.actions.map((action) => (
          <li key={`${action.actionType}-${action.sortOrder}`}>
            <a
              className="public-action-primary"
              href={action.destination}
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
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
        {hasDonate && hasVolunteer
          ? "Donation processing and volunteer registration continue securely through DonorView."
          : hasDonate
            ? "Donation processing continues securely through DonorView."
            : hasVolunteer
              ? "Volunteer registration continues securely through DonorView."
              : "Learn more opens the linked external destination."}
      </p>
    </div>
  );
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
      className="border-brand-bright-green bg-surface-subtle mt-10 border-t-4 p-6 sm:p-8"
    >
      <h2 id="campaign-progress-heading" className="type-display text-2xl">
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
            className="bg-brand-cool-gray h-3 overflow-hidden"
          >
            <div
              className="bg-brand-bright-green h-full"
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
    <dl className="border-brand-cool-gray mt-8 grid gap-4 border-y py-6 sm:grid-cols-2">
      {facts.map((fact) => (
        <div
          key={`${fact.sortOrder}-${fact.label}`}
          className="border-brand-cool-gray border-l-2 pl-4"
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
    <section aria-labelledby="campaign-projects-heading" className="mt-16">
      <h2 id="campaign-projects-heading" className="public-section-heading">
        Projects connected to this purpose
      </h2>
      <ul className="mt-3">
        {campaign.projects.map((project) => (
          <li
            key={project.slug}
            className="border-brand-cool-gray border-t py-5"
          >
            <Link
              className="text-brand-traditional-blue decoration-brand-bright-blue text-lg font-semibold underline underline-offset-4"
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
    <li className="py-7">
      <article>
        <p className="text-brand-traditional-blue text-sm font-bold">
          {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]} ·{" "}
          {CAMPAIGN_TYPE_LABELS[campaign.campaignType]}
        </p>
        <h2 className="text-brand-black type-display mt-2 text-3xl font-semibold">
          <Link
            className="decoration-brand-bright-blue hover:text-brand-traditional-blue underline underline-offset-4"
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
      <p className="text-brand-traditional-blue text-sm font-bold">
        {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]} ·{" "}
        {CAMPAIGN_TYPE_LABELS[campaign.campaignType]}
      </p>
      <h1 className="text-display-foreground type-display mt-3 text-5xl leading-[0.98] font-semibold tracking-[-0.03em] sm:text-6xl">
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
