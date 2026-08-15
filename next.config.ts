import type { NextConfig } from "next";

export function buildContentSecurityPolicy() {
  const developmentScriptSource =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // Next.js emits small framework bootstrap scripts and Turbopack's React
    // development tooling requires eval only in the development runtime.
    `script-src 'self' 'unsafe-inline'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const contentSecurityPolicy = buildContentSecurityPolicy();

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  ...(process.env.APP_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          // Domain-wide includeSubDomains/preload is deferred until G-05
          // confirms canonical DNS and HTTPS coverage for every subdomain.
          value: "max-age=31536000",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
