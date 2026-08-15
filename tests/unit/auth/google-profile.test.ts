import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { verifiedGoogleCallbackUserInfo } from "@/platform/auth/google-profile";

const audience = "foundation-google-client";
const domain = "example.org";

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createSignedToken(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", kid: "foundation-key" });
  const payload = base64UrlJson({
    iss: "https://accounts.google.com",
    aud: audience,
    iat: now,
    exp: now + 300,
    sub: "google-subject-123",
    email: `administrator@${domain}`,
    email_verified: true,
    hd: domain,
    name: "Foundation Administrator",
    picture: "https://example.org/profile.png",
    ...overrides,
  });
  const signed = `${header}.${payload}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signed),
    privateKey,
  ).toString("base64url");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        keys: [
          {
            ...publicJwk,
            alg: "RS256",
            kid: "foundation-key",
            use: "sig",
          },
        ],
      }),
    ),
  );
  return `${signed}.${signature}`;
}

afterEach(() => vi.unstubAllGlobals());

describe("Google authorization-code callback identity", () => {
  it("accepts only a cryptographically valid current identity for the exact audience and Workspace", async () => {
    const token = createSignedToken();

    await expect(
      verifiedGoogleCallbackUserInfo({ idToken: token }, audience, domain),
    ).resolves.toMatchObject({
      user: {
        id: "google-subject-123",
        email: `administrator@${domain}`,
        emailVerified: true,
        workspaceDomain: domain,
      },
    });
  });

  it("rejects a modified token, wrong audience, unverified email, or wrong Workspace claim", async () => {
    const validToken = createSignedToken();
    const [header, , signature] = validToken.split(".");
    const modifiedPayload = base64UrlJson({
      iss: "https://accounts.google.com",
      aud: audience,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      sub: "attacker",
      email: `attacker@${domain}`,
      email_verified: true,
      hd: domain,
      name: "Attacker",
    });
    await expect(
      verifiedGoogleCallbackUserInfo(
        { idToken: `${header}.${modifiedPayload}.${signature}` },
        audience,
        domain,
      ),
    ).resolves.toBeNull();

    await expect(
      verifiedGoogleCallbackUserInfo(
        { idToken: validToken },
        "different-client",
        domain,
      ),
    ).resolves.toBeNull();
    await expect(
      verifiedGoogleCallbackUserInfo(
        { idToken: createSignedToken({ email_verified: false }) },
        audience,
        domain,
      ),
    ).resolves.toBeNull();
    await expect(
      verifiedGoogleCallbackUserInfo(
        { idToken: createSignedToken({ hd: "other.example.org" }) },
        audience,
        domain,
      ),
    ).resolves.toBeNull();
  });

  it("rejects an untrusted issuer, expired token, and token older than the one-hour maximum", async () => {
    const now = Math.floor(Date.now() / 1000);

    await expect(
      verifiedGoogleCallbackUserInfo(
        { idToken: createSignedToken({ iss: "https://attacker.example" }) },
        audience,
        domain,
      ),
    ).resolves.toBeNull();
    await expect(
      verifiedGoogleCallbackUserInfo(
        {
          idToken: createSignedToken({ iat: now - 300, exp: now - 1 }),
        },
        audience,
        domain,
      ),
    ).resolves.toBeNull();
    await expect(
      verifiedGoogleCallbackUserInfo(
        {
          idToken: createSignedToken({ iat: now - 7_200, exp: now + 300 }),
        },
        audience,
        domain,
      ),
    ).resolves.toBeNull();
  });
});
