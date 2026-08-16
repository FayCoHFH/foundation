import type { AdminNavigationItem } from "./admin-shell";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";

const COMMUNICATIONS_ROUTES = {
  dashboard: "/admin/communications",
  queue: "/admin/communications/queue",
  stories: "/admin/communications/stories",
  news: "/admin/communications/news",
  notices: "/admin/communications/notices",
  homepage: "/admin/communications/homepage",
} as const;

function currentRoute(currentHref: string, href: string) {
  return currentHref === href || currentHref.startsWith(`${href}/`);
}

function hasCapability(principal: AdminPrincipal, capability: Capability) {
  return principal.capabilities.includes(capability);
}

export function communicationsNavigation(
  principal: AdminPrincipal,
  currentHref: string,
): AdminNavigationItem[] {
  const navigation: AdminNavigationItem[] = [
    {
      href: "/admin",
      label: "Administration",
      current: currentHref === "/admin",
    },
  ];
  if (hasCapability(principal, "communications.queue.read")) {
    navigation.push({
      href: COMMUNICATIONS_ROUTES.queue,
      label: "Publication Queue",
      current: currentRoute(currentHref, COMMUNICATIONS_ROUTES.queue),
    });
  }
  if (hasCapability(principal, "communications.dashboard.read")) {
    navigation.splice(1, 0, {
      href: COMMUNICATIONS_ROUTES.dashboard,
      label: "Communications Dashboard",
      current: currentHref === COMMUNICATIONS_ROUTES.dashboard,
    });
  }
  if (
    hasCapability(principal, "stories.create") ||
    hasCapability(principal, "stories.read.draft.own") ||
    hasCapability(principal, "stories.read.draft.any")
  ) {
    navigation.push({
      href: COMMUNICATIONS_ROUTES.stories,
      label: "Story drafts",
      current: currentRoute(currentHref, COMMUNICATIONS_ROUTES.stories),
    });
  }
  if (
    hasCapability(principal, "news.create") ||
    hasCapability(principal, "news.read.draft.own") ||
    hasCapability(principal, "news.read.draft.any")
  ) {
    navigation.push({
      href: COMMUNICATIONS_ROUTES.news,
      label: "News",
      current: currentRoute(currentHref, COMMUNICATIONS_ROUTES.news),
    });
  }
  if (hasCapability(principal, "communications.notices.manage")) {
    navigation.push({
      href: COMMUNICATIONS_ROUTES.notices,
      label: "Site Notices",
      current: currentRoute(currentHref, COMMUNICATIONS_ROUTES.notices),
    });
  }
  if (hasCapability(principal, "communications.placements.manage")) {
    navigation.push({
      href: COMMUNICATIONS_ROUTES.homepage,
      label: "Homepage curation",
      current: currentRoute(currentHref, COMMUNICATIONS_ROUTES.homepage),
    });
  }
  return navigation;
}
