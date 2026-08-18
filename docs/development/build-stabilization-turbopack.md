# Turbopack production-build stabilization

Status: Resolved locally on 2026-08-18

## Finding

The standard `pnpm build` panic was caused by stale or incomplete generated
build state, not by the G1 source changes, a Prisma schema defect, or a
dependency interaction.

The failure was reproducible from the previously contaminated `.next` state:

```text
Error [TurbopackInternalError]: TaskId { id: 672455 } <Code as GenerateSourceMap>::generate_source_map was canceled
```

The panic occurred while Turbopack emitted source maps, before application
diagnostics or route generation. `next.config.ts` already sets
`productionBrowserSourceMaps: false` and contains no Turbopack or Webpack
override. G1 did not change `package.json`, `pnpm-lock.yaml`, or the native
dependency set.

## Comparison and isolation

- The immediate pre-G1 commit, `321ffe9`, compiled and completed a full
  Turbopack production build against the disposable migrated build database.
- A fresh G1 worktree at `b7d108b` compiled successfully after frozen install
  and Prisma generation; its only empty-database failure was the expected
  missing-table error during `/projects` prerender.
- The current G1 worktree passed after removing `.next` and regenerating the
  Prisma client, including TypeScript, static generation, and all routes.
- A second standard build from that clean state also passed.
- Webpack production build passed independently. Its warnings are the
  pre-existing dynamic-require warnings from `libheif-js` and the evidence
  processing dependency, not the Turbopack panic.
- G1 server/client boundaries were inspected. The client-safe DonorView
  content module remains separate from the `server-only` service; no new
  Prisma, Node, or native dependency leaked into a client graph.
- Disabling browser source maps did not change the previously observed panic;
  no source-map configuration change is justified.

The evidence classifies this as a stale generated-state interaction in the
Next.js 16.3.1/Turbopack build pipeline. No source-level trigger remained after
clean state regeneration, so no product or G1 behavior change was made.

## Recovery and build policy

The normal production path remains:

```text
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
```

For a local workspace that has an interrupted or mixed bundler build, use the
explicit recovery command:

```text
pnpm build:clean
```

It removes only generated `.next` output, regenerates Prisma, and invokes the
unchanged standard Turbopack build. It does not remove databases, source files,
or user data. CI and Vercel already begin from clean build state and remain on
their existing `pnpm db:generate && pnpm build` commands; no CI exception is
required.

## Validation evidence

Validated with Node 22.22.3, pnpm 10.13.1, Next 16.3.1, and React 19.2.8:

- standard Turbopack build: passed twice from clean generated state;
- pre-G1 Turbopack build: passed;
- Webpack production build: passed;
- Prisma validation and generation: passed;
- no package or lockfile dependency changes;
- G1 unit, PostgreSQL integration, and focused browser regressions remained
  green after the build-state recovery command was added.
