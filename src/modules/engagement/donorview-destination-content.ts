import type {
  DonorViewDestinationPurpose,
  DonorViewDestinationStatus,
} from "@/generated/prisma/client";

export const DONORVIEW_PURPOSES = [
  "GENERAL_DONATE",
  "CAMPAIGN_DONATE",
  "GENERAL_VOLUNTEER",
  "VOLUNTEER_EVENT",
] as const satisfies readonly DonorViewDestinationPurpose[];

export const DONORVIEW_STATUS_LABELS: Record<
  DonorViewDestinationStatus,
  string
> = {
  UNVERIFIED: "Unverified",
  VERIFIED: "Verified",
  INACTIVE: "Inactive",
};

export const DONORVIEW_PURPOSE_LABELS: Record<
  DonorViewDestinationPurpose,
  string
> = {
  GENERAL_DONATE: "General Donate",
  CAMPAIGN_DONATE: "Campaign Donate",
  GENERAL_VOLUNTEER: "General Volunteer",
  VOLUNTEER_EVENT: "Volunteer Event",
};

export type DonorViewDestinationInput = Readonly<{
  purpose: DonorViewDestinationPurpose;
  label: string;
  url: string;
  pageReference?: string | null;
}>;

export type DonorViewDestinationAdmin = Readonly<{
  id: string;
  provider: "DONORVIEW";
  purpose: DonorViewDestinationPurpose;
  purposeLabel: string;
  label: string;
  url: string;
  host: string;
  pageReference: string | null;
  status: DonorViewDestinationStatus;
  statusLabel: string;
  verifiedAt: Date | null;
  verifiedByAdminUserId: string | null;
  lastReviewedAt: Date | null;
  version: number;
  updatedAt: Date;
  usage: Readonly<{
    globalDonate: boolean;
    globalVolunteer: boolean;
    campaigns: readonly Readonly<{
      campaignId: string;
      title: string;
      actionType: "DONATE" | "VOLUNTEER";
    }>[];
  }>;
}>;

export type DonorViewDestinationOption = Readonly<{
  id: string;
  purpose: DonorViewDestinationPurpose;
  label: string;
  pageReference: string | null;
  urlHost: string;
}>;

export type EngagementConfigurationReadModel = Readonly<{
  id: string;
  version: number;
  generalDonateDestinationId: string | null;
  generalVolunteerDestinationId: string | null;
}>;
