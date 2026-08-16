import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import {
  DASHBOARD_MAX_UPCOMING_HORIZON_DAYS,
  dashboardModuleVisibility,
  getCommunicationsDashboard,
} from "@/modules/communications/dashboard";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

import { DashboardContent } from "./dashboard-ui";

export const metadata: Metadata = { title: "Communications Dashboard" };

type DashboardSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseWindow(value: string | undefined) {
  if (value === undefined) return { days: 14, invalid: false };
  const days = Number(value);
  return {
    days:
      Number.isSafeInteger(days) &&
      days >= 1 &&
      days <= DASHBOARD_MAX_UPCOMING_HORIZON_DAYS
        ? days
        : 14,
    invalid:
      !Number.isSafeInteger(days) ||
      days < 1 ||
      days > DASHBOARD_MAX_UPCOMING_HORIZON_DAYS,
  };
}

function readFailureMessage(error: unknown) {
  if (error instanceof AppError && error.code === "INVALID_INPUT") {
    return "That Dashboard window is invalid. Choose a window from 1 to 90 days.";
  }
  return "The Communications Dashboard is temporarily unavailable. Try again shortly.";
}

export default async function CommunicationsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated") {
    redirect("/admin/sign-in?next=%2Fadmin%2Fcommunications");
  }
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "communications.dashboard.read")
  ) {
    redirect("/admin/access-denied");
  }

  const principal = access.principal;
  const parsedWindow = parseWindow(firstValue((await searchParams).days));
  let dashboard = null as Awaited<
    ReturnType<typeof getCommunicationsDashboard>
  > | null;
  let errorMessage: string | undefined;
  if (parsedWindow.invalid) {
    errorMessage =
      "That Dashboard window is invalid. Choose a window from 1 to 90 days.";
  } else {
    const evaluationTime = new Date();
    try {
      dashboard = await getCommunicationsDashboard(prisma, principal, {
        evaluationTime,
        upcomingUntil: new Date(
          evaluationTime.getTime() + parsedWindow.days * 24 * 60 * 60 * 1_000,
        ),
      });
    } catch (error) {
      errorMessage = readFailureMessage(error);
    }
  }

  return (
    <AdminShell
      identity={{ displayName: principal.name, email: principal.email }}
      navigation={communicationsNavigation(principal, "/admin/communications")}
      accountActions={
        <form action={signOutAdmin}>
          <button
            type="submit"
            className="border-border min-h-11 rounded-sm border px-3 font-semibold"
          >
            Sign out
          </button>
        </form>
      }
    >
      <DashboardContent
        dashboard={dashboard}
        {...(errorMessage ? { errorMessage } : {})}
        visibility={dashboardModuleVisibility(principal.capabilities)}
      />
    </AdminShell>
  );
}
