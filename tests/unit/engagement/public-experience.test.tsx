import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ParticipationLink,
  PublicHandoff,
} from "@/components/engagement/public-handoff";

describe("public Giving and Volunteer experience", () => {
  it.each([
    ["Donate", "secure DonorView giving page"],
    ["Volunteer", "secure DonorView volunteer registration"],
  ] as const)("renders a governed %s handoff", (action, context) => {
    const html = renderToStaticMarkup(
      <PublicHandoff
        destination={{
          id: "destination-id",
          url: "https://app.dvforms.net/example",
        }}
        action={action}
      />,
    );
    expect(html).toContain(`href="https://app.dvforms.net/example"`);
    expect(html).toContain(action);
    expect(html).toContain(context);
    expect(html).toContain("DonorView");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<iframe");
  });

  it.each(["Donate", "Volunteer"] as const)(
    "renders a safe unavailable %s state without a broken anchor",
    (action) => {
      const html = renderToStaticMarkup(
        <PublicHandoff destination={null} action={action} />,
      );
      expect(html).toContain("not available yet");
      expect(html).not.toContain("href=");
      expect(html).not.toContain("<form");
    },
  );

  it("keeps the information-page link internal", () => {
    const html = renderToStaticMarkup(
      <ParticipationLink href="/campaigns">
        Explore all Campaigns
      </ParticipationLink>,
    );
    expect(html).toContain('href="/campaigns"');
    expect(html).not.toContain('target="_blank"');
  });
});
