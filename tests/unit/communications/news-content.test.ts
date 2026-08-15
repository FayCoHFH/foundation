import { describe, expect, it } from "vitest";
import {
  hashNewsCandidate,
  isCurrentNews,
  newsDocumentFromPlainText,
  validateNewsDocument,
} from "@/modules/communications/news";

describe("News content and availability", () => {
  it("hashes canonical News candidates including expiration", () => {
    const body = newsDocumentFromPlainText("A concise update.");
    expect(
      hashNewsCandidate({
        headline: " Update ",
        summary: " Summary ",
        body,
        expiresAt: null,
      }),
    ).toBe(
      hashNewsCandidate({
        headline: "Update",
        summary: "Summary",
        body,
        expiresAt: null,
      }),
    );
    expect(
      hashNewsCandidate({
        headline: "Update",
        summary: "Summary",
        body,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).not.toBe(
      hashNewsCandidate({
        headline: "Update",
        summary: "Summary",
        body,
        expiresAt: null,
      }),
    );
  });
  it("allows the smaller News profile and rejects Story-only block quotes", () => {
    expect(() =>
      validateNewsDocument({
        schemaVersion: 1,
        root: { type: "doc", content: [{ type: "blockquote", content: [] }] },
      }),
    ).toThrow();
  });
  it("derives current and expired availability from an explicit clock", () => {
    const now = new Date("2030-01-02T00:00:00.000Z");
    expect(isCurrentNews({ expiresAt: null }, now)).toBe(true);
    expect(
      isCurrentNews({ expiresAt: new Date("2030-01-02T00:00:01.000Z") }, now),
    ).toBe(true);
    expect(
      isCurrentNews({ expiresAt: new Date("2030-01-02T00:00:00.000Z") }, now),
    ).toBe(false);
  });
});
