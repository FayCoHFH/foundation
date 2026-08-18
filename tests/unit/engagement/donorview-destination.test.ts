import { describe, expect, it } from "vitest";

import { validateDonorViewUrl } from "@/modules/engagement";
import { ValidationError } from "@/platform/errors/app-error";

describe("DonorView destination URL contract", () => {
  it("accepts only known public DonorView HTTPS hosts", () => {
    expect(validateDonorViewUrl("https://app.dvforms.net/api/dv/example")).toBe(
      "https://app.dvforms.net/api/dv/example",
    );
    expect(validateDonorViewUrl("https://app.donorview.com/Example")).toBe(
      "https://app.donorview.com/Example",
    );
  });

  it.each([
    "http://app.dvforms.net/api/dv/example",
    "https://app.dvforms.net.evil.example/example",
    "https://user:secret@app.dvforms.net/example",
    "https://app.dvforms.net/example#token",
    "https://localhost/example",
    "https://127.0.0.1/example",
    "https://192.168.1.10/example",
  ])("rejects unsafe or unapproved URL %s", (url) => {
    expect(() => validateDonorViewUrl(url)).toThrow(ValidationError);
  });
});
