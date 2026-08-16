import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  getAvailablePublicationQueueViews,
  getPublicationQueue,
  listPublicationQueueOwnerOptions,
} from "@/modules/communications/queue";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

import {
  PublicationQueueContent,
  QueuePageHeader,
  type QueuePageState,
} from "./queue-ui";
import { parseQueueSearchParams, type QueueSearchParams } from "./queue-query";

export const metadata: Metadata = { title: "Publication Queue" };

function validationMessage(
  invalid: ReturnType<typeof parseQueueSearchParams>["invalid"],
) {
  return Object.values(invalid).some(Boolean)
    ? "That Queue link contains an invalid view, filter, or page value. Choose a valid option and try again."
    : undefined;
}

function readFailureMessage(error: unknown) {
  if (error instanceof AppError && error.code === "AUTHORIZATION_DENIED") {
    return "This Queue view or owner filter is not available to your administrator account.";
  }
  if (error instanceof AppError && error.code === "INVALID_INPUT") {
    return "That Queue filter is invalid. Choose a listed option and try again.";
  }
  return "The Publication Queue is temporarily unavailable. Try again shortly.";
}

export default async function PublicationQueuePage({
  searchParams,
}: {
  searchParams: Promise<QueueSearchParams>;
}) {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated") {
    redirect("/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fqueue");
  }
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "communications.queue.read")
  ) {
    redirect("/admin/access-denied");
  }

  const principal = access.principal;
  const availableViews = getAvailablePublicationQueueViews(principal);
  const parsed = parseQueueSearchParams(await searchParams);
  const firstAvailableView = availableViews[0] ?? "MY_DRAFTS";
  const requestedView = parsed.state.view;
  const viewAvailable = availableViews.includes(requestedView);
  const state: QueuePageState = {
    ...parsed.state,
    view: viewAvailable ? requestedView : firstAvailableView,
  };
  const validationError = validationMessage(parsed.invalid);
  const requestedViewLabel =
    requestedView === "MY_DRAFTS" ? "requested" : requestedView;
  const unavailableMessage =
    !validationError && !viewAvailable
      ? `The ${requestedViewLabel} Queue view is not available to your administrator account. Showing ${state.view === "MY_DRAFTS" ? "My Drafts" : "the first available view"}.`
      : undefined;
  const now = new Date();

  let ownerOptions = [] as Awaited<
    ReturnType<typeof listPublicationQueueOwnerOptions>
  >;
  let ownerOptionsError: string | undefined;
  try {
    ownerOptions = [
      ...(await listPublicationQueueOwnerOptions(prisma, principal, now)),
    ];
  } catch {
    ownerOptionsError =
      "Owner filtering is temporarily unavailable; the Queue remains available without that filter.";
  }

  let result = null as Awaited<ReturnType<typeof getPublicationQueue>> | null;
  let errorMessage = validationError ?? ownerOptionsError;
  if (!errorMessage && !unavailableMessage && availableViews.length) {
    try {
      result = await getPublicationQueue(prisma, principal, {
        view: state.view,
        filters: {
          kind: state.kind,
          ...(state.owner ? { editorialOwnerAdminUserId: state.owner } : {}),
        },
        page: state.page,
        pageSize: state.pageSize,
        now,
      });
    } catch (error) {
      errorMessage = readFailureMessage(error);
    }
  }

  return (
    <AdminShell
      identity={{ displayName: principal.name, email: principal.email }}
      navigation={communicationsNavigation(
        principal,
        "/admin/communications/queue",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <QueuePageHeader />
      <PublicationQueueContent
        availableViews={availableViews}
        ownerOptions={ownerOptions}
        result={result}
        state={state}
        errorMessage={errorMessage}
        unavailableMessage={unavailableMessage}
        canCreateStory={hasCapability(principal, "stories.create")}
        canCreateNews={hasCapability(principal, "news.create")}
      />
    </AdminShell>
  );
}
