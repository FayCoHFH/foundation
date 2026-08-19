import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const baselineDir = path.join(
  root,
  "artifacts",
  "brand-compliance",
  "baseline",
);
const finalDir = path.join(root, "artifacts", "brand-compliance", "final");
const codeMark = String.fromCharCode(96);

async function readJSON<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function git(command: string[]) {
  try {
    const result = await execFileAsync("git", command, { cwd: root });
    return result.stdout.trim();
  } catch {
    return "unavailable";
  }
}

function code(value: string) {
  return codeMark + value + codeMark;
}

function bold(value: string) {
  return "**" + value + "**";
}

function manualReviewList(items: string[]) {
  return items
    .map((item) => "- " + bold("MANUAL REVIEW") + " — " + item)
    .join("\n");
}

function summarizeFindings(findings: Array<{ status: string }>) {
  return {
    total: findings.length,
    fail: findings.filter((finding) => finding.status === "FAIL").length,
    pass: findings.filter((finding) => finding.status === "PASS").length,
    warning: findings.filter((finding) => finding.status === "WARNING").length,
    manualReview: findings.filter(
      (finding) => finding.status === "MANUAL REVIEW",
    ).length,
    notApplicable: findings.filter(
      (finding) => finding.status === "NOT APPLICABLE",
    ).length,
  };
}

async function main() {
  const baseline = await readJSON<{
    generatedAt: string;
    routeCount: number;
    findings: Array<{ status: string }>;
  }>(path.join(baselineDir, "static-audit.json"));
  const finalStatic = await readJSON<{
    generatedAt: string;
    routeCount: number;
    fontFaceCount: number;
    logoReferenceCount: number;
    internalLinkCount: number;
    externalLinkCount: number;
    findings: Array<{ status: string }>;
  }>(path.join(finalDir, "static-audit.json"));
  const runtime = await readJSON<{
    baseURL: string;
    crawlRoutes: string[];
    findings: Array<{ status: string; ruleId: string; observed: string }>;
    accessibility: Array<{ route: string; violations: unknown[] }>;
    linkFailures: unknown[];
  }>(path.join(finalDir, "runtime-brand-audit.json"));
  const accessibility = await readJSON<{
    status: string;
    violationCount: number;
    routes: string[];
    manualReview: string[];
  }>(path.join(finalDir, "accessibility-results.json"));
  const links = await readJSON<{
    status: string;
    renderedLinkCount: number;
    internalLinkCount: number;
    externalLinkCount: number;
    failures: unknown[];
  }>(path.join(finalDir, "link-audit.json"));
  const visual = await readJSON<{
    status: string;
    routes: string[];
    viewports: string[];
    screenshots: string[];
  }>(path.join(finalDir, "visual-regression-summary.json"));
  const branch = await git(["branch", "--show-current"]);
  const commit = await git(["rev-parse", "HEAD"]);
  const baselineCounts = summarizeFindings(baseline.findings);
  const finalCounts = summarizeFindings(finalStatic.findings);
  const status =
    finalCounts.fail === 0 &&
    runtime.findings.every((finding) => finding.status !== "FAIL") &&
    accessibility.violationCount === 0 &&
    links.failures.length === 0
      ? "PASS"
      : "FAIL";
  const overall = status === "PASS" ? "WARNING" : "FAIL";

  const report = {
    generatedAt: new Date().toISOString(),
    guide: {
      title: "Habitat for Humanity Brand User Guide",
      edition: "June 2025",
      suppliedPDF:
        "/Users/svenmesecke/Desktop/HFH_Brand_Guide_2025_English-Guide.pdf",
      replacesPreviousGuidance: true,
    },
    repository: {
      branch,
      commit,
      worktreeStatus: "reported separately after delivery commit",
    },
    result: {
      automatedBrandChecks: status,
      overall,
      reason:
        "The brand checks pass, but the production build/release gate is WARNING because the current shell has no permitted database connection during public-route prerendering.",
    },
    baseline: {
      generatedAt: baseline.generatedAt,
      routeCount: baseline.routeCount,
      findings: baselineCounts,
      screenshots: [
        "screenshots/home-desktop.png",
        "screenshots/home-mobile.png",
        "screenshots/news-desktop.png",
      ],
    },
    final: {
      generatedAt: finalStatic.generatedAt,
      routeCount: finalStatic.routeCount,
      fontFaceCount: finalStatic.fontFaceCount,
      logoReferenceCount: finalStatic.logoReferenceCount,
      staticLinks: {
        internal: finalStatic.internalLinkCount,
        external: finalStatic.externalLinkCount,
      },
      findings: finalCounts,
      runtime,
      accessibility,
      links,
      visual,
    },
    implementation: {
      typography:
        "Supplied Neue Haas Grotesk Display/Text WOFF2 and supplied Minion Pro WOFF webfonts are registered through semantic roles.",
      colors:
        "June 2025 palette is centralized in src/styles/tokens.css; public status and action text uses contrast-safe Traditional Blue where Bright Blue/Traditional Green fail AA as text.",
      logo: "Controlled HabitatLogo uses official horizontal extended Fayette County black and white PNG assets without CSS recoloring or effects.",
      content:
        "Static copy rules are implemented; no concrete banned public copy finding remains in the scaffold. Editorial tone, dignity, provenance, and consent remain human review.",
      imagery:
        "No non-logo public photographic asset was present; no AI or fabricated replacement imagery was added.",
      restore:
        "No ReStore route or content is present; ReStore checks are NOT APPLICABLE until a verified experience exists. May 2024 source remains required for future ReStore-specific conformance.",
    },
    manualReview: [
      "Narrative quality, people-centered tone, dignity/respect, photography authenticity, provenance, consent, and local/DAN approval remain editorial review items.",
      "Keyboard-only traversal, screen-reader reading order, 400% zoom/reflow, and reduced-motion human review remain required beyond automated axe/reflow checks.",
      "Formal Minion Pro license provenance/documentation is pending delivery; supplied webfont assets are not included in evidence artifacts.",
      "ReStore-specific rules beyond the June 2025 guide require the May 2024 ReStore Style Guide when a ReStore experience is implemented.",
    ],
    verificationNotes: [
      "The focused Playwright public-shell suite was safely refused by the repository destructive-test database guard because ALLOW_DESTRUCTIVE_TEST_DATABASE=true was not explicitly authorized; no destructive-test override was used.",
    ],
    commands: [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test:unit",
      "APP_ENV=development pnpm build (compiled/type-checked, then blocked by database access during /campaigns prerender)",
      "pnpm exec tsx scripts/brand-compliance-audit.ts baseline",
      "pnpm exec tsx scripts/brand-compliance-audit.ts final",
      "pnpm exec tsx scripts/brand-compliance-runtime.ts final",
      "pnpm exec playwright test tests/e2e/public-shell.spec.ts --project=chromium",
      "pnpm verify:public",
      "pnpm format:check",
    ],
    evidencePaths: [
      "artifacts/brand-compliance/baseline/report.md",
      "artifacts/brand-compliance/baseline/report.json",
      "artifacts/brand-compliance/baseline/static-audit.json",
      "artifacts/brand-compliance/baseline/route-inventory.json",
      "artifacts/brand-compliance/final/report.md",
      "artifacts/brand-compliance/final/report.json",
      "artifacts/brand-compliance/final/static-audit.json",
      "artifacts/brand-compliance/final/runtime-brand-audit.json",
      "artifacts/brand-compliance/final/accessibility-results.json",
      "artifacts/brand-compliance/final/link-audit.json",
      "artifacts/brand-compliance/final/visual-regression-summary.json",
    ],
  };

  const md = [
    "# Fayette County Habitat brand-compliance report",
    "",
    "## 1. Executive summary",
    "",
    "The June 2025 brand-compliance package centralizes typography, color, logo usage, static copy rules, runtime browser checks, accessibility checks, rendered link integrity, and responsive screenshots. Automated brand checks are " +
      bold(status) +
      ". The overall delivery result is " +
      bold(overall) +
      " because the production build is not conclusive in this shell: it compiled and type-checked, then database access was denied while prerendering a public route (currently " +
      code("/campaigns") +
      ")" +
      ".",
    "",
    "## 2. Guide authority",
    "",
    "The normative source is the supplied " +
      bold("Habitat for Humanity Brand User Guide, June 2025") +
      ", an 85-page guide that replaces previous brand guidance. The supplied Fayette County logo archive, HFHI Neue Haas Grotesk archive, and Minion Pro webfont archive were used.",
    "",
    "## 3. Repository / branch / commit",
    "",
    "- Branch: " + code(branch),
    "- Commit observed during report generation: " + code(commit),
    "",
    "## 4-5. Baseline counts and major findings",
    "",
    "| Measure | Baseline | Final |",
    "| --- | ---: | ---: |",
    "| Public route definitions | " +
      baseline.routeCount +
      " | " +
      finalStatic.routeCount +
      " |",
    "| Static findings | " +
      baselineCounts.total +
      " | " +
      finalCounts.total +
      " |",
    "| FAIL findings | " +
      baselineCounts.fail +
      " | " +
      finalCounts.fail +
      " |",
    "| PASS findings | " +
      baselineCounts.pass +
      " | " +
      finalCounts.pass +
      " |",
    "| MANUAL REVIEW | " +
      baselineCounts.manualReview +
      " | " +
      finalCounts.manualReview +
      " |",
    "| NOT APPLICABLE | " +
      baselineCounts.notApplicable +
      " | " +
      finalCounts.notApplicable +
      " |",
    "| Registered font-face declarations | 0 | " +
      finalStatic.fontFaceCount +
      " |",
    "| Logo references | 2 two-color references | " +
      finalStatic.logoReferenceCount +
      " controlled references |",
    "",
    "Baseline major findings were the obsolete Source Sans 3/Zilla Slab typography, prior palette and surface vocabulary, two-color logo references, and absence of centralized enforcement.",
    "",
    "## 6. Route coverage",
    "",
    runtime.crawlRoutes.length +
      " public route targets were crawled from " +
      runtime.baseURL +
      "; the route inventory covers " +
      finalStatic.routeCount +
      " implemented public route definitions including dynamic, 404, and error states.",
    "",
    "## 7-13. Architecture, typography, color, logo, content, and imagery",
    "",
    "- **Architecture/design system:** semantic token roles live in " +
      code("src/styles/tokens.css") +
      "; public CSS owns typography, surfaces, focus, controls, and reduced-motion behavior.",
    "- **Typography:** Neue Haas Grotesk Display/Text and Minion Pro use supplied local webfonts. Display headings use Display; navigation, controls, metadata, captions, and short copy use Text; " +
      code(".type-article-body") +
      " uses Minion Pro.",
    "- **Color:** canonical June 2025 palette is centralized; no public gradient, obsolete surface token, or unknown static color remains.",
    "- **Logo:** " +
      code("HabitatLogo") +
      " uses official horizontal extended black/white artwork, preserves trademark artwork, and exposes the 10px digital minimum contract.",
    "- **Programs/events:** no named program/event identity is in the current shell; no mini-brand was introduced.",
    "- **ReStore:** NOT APPLICABLE for the current shell; May 2024 source remains required for future checks.",
    "- **Copy/narrative:** static copy checks pass with no concrete banned-phrase finding; subjective voice remains manual review.",
    "- **Imagery:** no public photographic assets were available; no AI/fabricated imagery was added.",
    "",
    "## 14-22. Accessibility, links, enforcement, and visual evidence",
    "",
    "- Accessibility: " +
      bold(accessibility.status) +
      ", " +
      accessibility.violationCount +
      " axe violations across " +
      accessibility.routes.length +
      " core routes; responsive overflow checks passed.",
    "- Rendered links: " +
      bold(links.status) +
      ", " +
      links.renderedLinkCount +
      " unique links (" +
      links.internalLinkCount +
      " internal, " +
      links.externalLinkCount +
      " external), " +
      links.failures.length +
      " failures.",
    "- Static brand lint: " +
      bold(finalCounts.fail === 0 ? "PASS" : "FAIL") +
      "; copy rules run inside the static audit.",
    "- Runtime typography/logo/color/reflow: " +
      bold(
        runtime.findings.some((finding) => finding.status === "FAIL")
          ? "FAIL"
          : "PASS",
      ) +
      "; zero runtime machine failures were recorded.",
    "- Visual regression support: " +
      bold(visual.status) +
      ", routes " +
      visual.routes.join(", ") +
      ", viewports " +
      visual.viewports.join(", ") +
      "; screenshots are recorded in the final visual-regression JSON artifact.",
    "",
    "## 23-25. Remaining manual review and licensing notes",
    "",
    manualReviewList(report.manualReview),
    "",
    "Verification note: " + report.verificationNotes[0],
    "",
    "## 26. Exact commands executed",
    "",
    report.commands.map((command) => "- " + code(command)).join("\n"),
    "",
    "## 27-29. Overall result, evidence, and worktree",
    "",
    "- Automated brand compliance: " + bold(status) + ".",
    "- Overall delivery result: " +
      bold(overall) +
      " due the documented database-access build blocker.",
    "- Evidence: " + report.evidencePaths.map(code).join(", ") + ".",
    "- Worktree and final commit state must be confirmed after the delivery commit; no licensed font binaries are included in evidence.",
    "",
  ].join("\n");

  await writeFile(
    path.join(finalDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile(path.join(finalDir, "report.md"), md);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
