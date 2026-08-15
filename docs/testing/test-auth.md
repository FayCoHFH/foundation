# Test authentication boundary

Slice 1 end-to-end tests use a narrow, server-only session fixture because real Google OAuth requires an external client, interactive credentials, and exact callback registration.

The fixture route is unavailable unless every control below is true:

- `APP_ENV=test`;
- `ENABLE_TEST_AUTH=true`;
- the runtime is not Vercel and is not preview/production;
- the request host is loopback;
- the configured `APP_BASE_URL` is loopback;
- any supplied Origin is the exact local application origin;
- `x-test-auth-secret` matches the non-public test secret.

The flag and secret are never `NEXT_PUBLIC_*` variables. Playwright generates a cryptographically random per-run secret unless the operator supplies a private one; no usable secret is committed. The runner sends it only to the fixture POST, not a browser bundle or general request header. The fixture inserts a real Better Auth database session and real local principal, external identity, role assignment, and audit event. All protected pages and actions then use the normal live database authorization path. It never grants capability based on an email suffix, route, client role, or arbitrary header.

The route returns an indistinguishable 404 when disabled or when any control fails. Environment validation refuses to start a Vercel, preview, or production runtime with test authentication enabled. No Vercel environment should define either test-auth variable.

Playwright configuration also runs the destructive database guard before it
starts a server. The operator must explicitly set
`ALLOW_DESTRUCTIVE_TEST_DATABASE=true`, and both database URLs must identify the
same allowed disposable `habitat*_test` target. Browser fixtures intentionally
leave append-only audit evidence; recreate or drop the disposable database
between complete local runs instead of pointing the suite at shared data.
