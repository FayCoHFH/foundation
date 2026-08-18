import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { issuePublicStorySubmissionFormToken } from "@/modules/communications/submissions/intake-service";
import { readServerEnvironment } from "@/platform/config/environment";

import { PublicStorySubmissionForm } from "./share-your-story-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Share Your Story" };

export default function ShareYourStoryPage() {
  const environment = readServerEnvironment();
  const token = issuePublicStorySubmissionFormToken({
    config: {
      enabled: environment.publicStorySubmissionsEnabled,
      secret: environment.publicStorySubmissionsSecret,
      privacyNoticeVersion:
        environment.publicStorySubmissionsPrivacyNoticeVersion,
      appOrigin: environment.appBaseUrl,
      appEnv: environment.appEnv,
      isVercel: environment.isVercel,
    },
  });
  const enabled = token !== null;
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink targetId="main-content" />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <header className="border-border bg-editorial-sky/30 border-b">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
            <p className="text-foreground text-sm font-bold tracking-[.16em] uppercase">
              Fayette County Habitat
            </p>
            <h1 className="text-editorial-pecan mt-4 font-serif text-5xl tracking-[-.035em] sm:text-6xl">
              Share Your Story
            </h1>
            <p className="text-foreground mt-5 max-w-2xl text-lg leading-8">
              Your experience can help us understand what this community means
              to the people who make it home.
            </p>
          </div>
        </header>
        <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
          {enabled ? (
            <PublicStorySubmissionForm
              formToken={token}
              privacyNoticeVersion={
                environment.publicStorySubmissionsPrivacyNoticeVersion!
              }
            />
          ) : (
            <section aria-labelledby="share-unavailable" className="max-w-2xl">
              <h2
                id="share-unavailable"
                className="text-editorial-pecan font-serif text-3xl"
              >
                Share Your Story is not accepting submissions right now.
              </h2>
              <p className="text-muted-foreground mt-5 leading-7">
                Please check back another time. No information is collected on
                this page while submissions are unavailable.
              </p>
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
