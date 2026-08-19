import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type Status = "PASS" | "FAIL" | "WARNING" | "MANUAL REVIEW" | "NOT APPLICABLE";

type Finding = {
  ruleId: string;
  status: Status;
  severity: "blocker" | "high" | "medium" | "low" | "info";
  route?: string;
  source: string;
  observed: string;
  expected: string;
  evidence?: string;
  guideReference?: string;
  recommendedRemediation?: string;
};

const root = process.cwd();
const phase = process.argv[2] === "final" ? "final" : "baseline";
const outputDir = path.join(root, "artifacts", "brand-compliance", phase);
const sourceRoots = [
  path.join(root, "src", "app"),
  path.join(root, "src", "components"),
  path.join(root, "src", "styles"),
];
const sourceExtensions = new Set([".css", ".ts", ".tsx", ".mdx", ".md"]);

const approvedColors = [
  "#0099CC",
  "#C4D600",
  "#888B8D",
  "#000000",
  "#FFFFFF",
  "#002F6C",
  "#FFD100",
  "#3AA047",
  "#E55D25",
  "#A4343A",
];

const publicSourceFiles = (files: string[]) =>
  files.filter(
    (file) =>
      !file.includes(`${path.sep}admin${path.sep}`) &&
      !file.includes(`${path.sep}api${path.sep}`),
  );

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

async function readSources(files: string[]) {
  return Promise.all(
    files.map(async (file) => ({
      file,
      relative: path.relative(root, file),
      text: await readFile(file, "utf8"),
    })),
  );
}

function routeFromFile(file: string) {
  const relative = path
    .relative(path.join(root, "src", "app"), file)
    .split(path.sep);
  const fileName = relative.pop();
  if (
    !fileName ||
    (fileName !== "page.tsx" &&
      fileName !== "not-found.tsx" &&
      fileName !== "error.tsx")
  )
    return null;
  if (relative[0] === "admin" || relative[0] === "api") return null;
  if (fileName === "not-found.tsx")
    return { route: "/404", source: path.relative(root, file), kind: "error" };
  if (fileName === "error.tsx")
    return {
      route: "/error",
      source: path.relative(root, file),
      kind: "error",
    };
  const route = relative.length
    ? `/${relative.map((segment) => (segment.startsWith("[") ? segment : segment)).join("/")}`
    : "/";
  return { route, source: path.relative(root, file), kind: "page" };
}

function findingCount(findings: Finding[], status?: Status) {
  return findings.filter((finding) =>
    status ? finding.status === status : true,
  ).length;
}

function lineEvidence(text: string, pattern: RegExp): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  const line = index >= 0 ? (lines[index] ?? "") : "";
  return line ? `${index + 1}: ${line.trim().slice(0, 240)}` : "not found";
}

async function main() {
  const files = (await Promise.all(sourceRoots.map(walk))).flat().sort();
  const sources = await readSources(files);
  const publicSources = sources.filter(
    ({ file }) => publicSourceFiles([file]).length > 0,
  );
  const sourceText = sources.map(({ text }) => text).join("\n");
  const publicText = publicSources.map(({ text }) => text).join("\n");
  const findings: Finding[] = [];

  const routes = files.map(routeFromFile).filter(Boolean);
  const publicRoutes = routes.filter(
    (route) => route && route.route !== "/error",
  );

  for (const source of sources) {
    const isPublic = publicSources.some(
      (candidate) => candidate.file === source.file,
    );
    const fileName = source.relative;
    const hasLegacyTypography =
      /Source_Sans_3|Zilla_Slab|font-serif|font-sans|font-family:\s*var\(--font-(source|zilla)/i.test(
        source.text,
      );
    if (isPublic && hasLegacyTypography) {
      findings.push({
        ruleId: "TYPE-001",
        status: phase === "final" ? "FAIL" : "FAIL",
        severity: "high",
        source: fileName,
        observed:
          "Public source contains legacy font configuration or non-semantic font utility classes.",
        expected:
          "Public typography resolves through semantic roles backed by Neue Haas Grotesk or Minion Pro.",
        evidence: lineEvidence(
          source.text,
          /Source_Sans_3|Zilla_Slab|font-serif|font-sans|font-family:\s*var\(--font-(source|zilla)/i,
        ),
        guideReference:
          "June 2025 guide, Creative / Typography; supplied HFHI Neue Haas Grotesk and Minion Pro assets",
        recommendedRemediation:
          "Replace legacy font configuration and raw utility choices with the semantic typography system.",
      });
    }
    const legacyColorName =
      /warm-paper|pale-habitat|editorial-(sky|denim|paintbrush|bluebonnet|pecan|oak|cream)|workshop-green|texas-clay|timber/i.test(
        source.text,
      );
    if (isPublic && legacyColorName) {
      findings.push({
        ruleId: "COLOR-001",
        status: "FAIL",
        severity: "high",
        source: fileName,
        observed:
          "Public source uses the prior ad-hoc visual-system token vocabulary.",
        expected:
          "Public surfaces use June 2025 semantic brand tokens and documented accessibility exceptions only.",
        evidence: lineEvidence(
          source.text,
          /warm-paper|pale-habitat|editorial-(sky|denim|paintbrush|bluebonnet|pecan|oak|cream)|workshop-green|texas-clay|timber/i,
        ),
        guideReference: "June 2025 guide, Creative / Color",
        recommendedRemediation:
          "Map public roles to the current palette and remove obsolete decorative surface tokens.",
      });
    }
    const rawColors =
      source.text.match(
        /#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![0-9A-Fa-f])/g,
      ) ?? [];
    for (const color of [...new Set(rawColors)]) {
      if (!approvedColors.includes(color.toUpperCase())) {
        findings.push({
          ruleId: "COLOR-002",
          status: "FAIL",
          severity: "medium",
          source: fileName,
          observed: `Raw color ${color} is present outside the approved June 2025 palette.`,
          expected:
            "Use semantic brand tokens; raw values are limited to the approved palette and documented accessibility exceptions.",
          evidence: color,
          guideReference: "June 2025 guide, Creative / Color",
          recommendedRemediation:
            "Replace the raw value with a semantic token or document a contrast exception.",
        });
      }
    }
    if (isPublic && /gradient/i.test(source.text)) {
      findings.push({
        ruleId: "COLOR-003",
        status: "FAIL",
        severity: "medium",
        source: fileName,
        observed:
          "Public source contains a gradient declaration or gradient-related treatment.",
        expected:
          "Do not use decorative gradients for brand surfaces, backgrounds, headlines, or large layout areas.",
        evidence: lineEvidence(source.text, /gradient/i),
        guideReference: "June 2025 guide, Creative / Color",
        recommendedRemediation:
          "Use a full-strength brand color or white surface with spacing and rules for hierarchy.",
      });
    }
    if (
      isPublic &&
      /filter\s*[:=]|filter-/.test(source.text) &&
      /logo|habitat/i.test(source.text)
    ) {
      findings.push({
        ruleId: "LOGO-004",
        status: "FAIL",
        severity: "high",
        source: fileName,
        observed: "Logo-related source contains a filter/effect hook.",
        expected:
          "Official logo artwork is used unchanged without filters, effects, recoloring, or distortion.",
        evidence: lineEvidence(source.text, /filter\s*[:=]|filter-/),
        guideReference: "June 2025 guide, Logo / Prohibited logo treatments",
        recommendedRemediation:
          "Remove the effect and use the official black or white asset variant.",
      });
    }
    if (
      isPublic &&
      /fayette-county-habitat-logo.*(avif|2clr)|FayetteCounty.*2clr/i.test(
        source.text,
      )
    ) {
      findings.push({
        ruleId: "LOGO-001",
        status: "FAIL",
        severity: "high",
        source: fileName,
        observed:
          "Public source references the supplied two-color logo treatment.",
        expected:
          "Default public use is the official horizontal extended black logo; official white is used on dark backgrounds.",
        evidence: lineEvidence(
          source.text,
          /fayette-county-habitat-logo.*(avif|2clr)|FayetteCounty.*2clr/i,
        ),
        guideReference: "June 2025 guide, Logo / Color and Logo formats",
        recommendedRemediation:
          "Use the controlled HabitatLogo component with official black or white artwork.",
      });
    }
  }

  const copyRules: Array<[string, RegExp, string, string]> = [
    [
      "COPY-001",
      /we build strength, stability, and self-reliance through shelter/i,
      "Retired brand statement is present.",
      "Remove the retired statement while preserving verified meaning.",
    ],
    [
      "COPY-002",
      /\bHabitat families\b|\bpartner families\b|\bdeserving families\b|\bbeneficiaries\b/i,
      "Potentially passive or possessive people language is present.",
      "Use people-centered language that describes partnership and active participation.",
    ],
    [
      "COPY-003",
      /hand up,? not a handout|\bfinancial literacy\b|\bfinancial education\b|\brequired sweat equity\b/i,
      "Retired or context-sensitive brand language is present.",
      "Review and reframe contextually; do not mechanically replace factual program language.",
    ],
  ];
  for (const [ruleId, pattern, observed, remediation] of copyRules) {
    const hit = publicSources.find(({ text }) => pattern.test(text));
    if (hit) {
      findings.push({
        ruleId,
        status: "FAIL",
        severity: "medium",
        source: hit.relative,
        observed,
        expected:
          "Public copy follows the June 2025 narrative and people-centered language guidance.",
        evidence: lineEvidence(hit.text, pattern),
        guideReference: "June 2025 guide, Narrative / Language tips and tricks",
        recommendedRemediation: remediation,
      });
    }
  }

  const logoReferences = publicSources.flatMap(({ relative, text }) =>
    [
      ...text.matchAll(
        /fayette-county-habitat-logo[^"'\s)]+|FayetteCounty[^"'\s)]+\.(?:png|jpg|jpeg|avif|svg)/gi,
      ),
    ].map((match) => ({ source: relative, asset: match[0] })),
  );
  if (!logoReferences.length) {
    findings.push({
      ruleId: "LOGO-001",
      status: "FAIL",
      severity: "high",
      source: "public source",
      observed: "No official logo asset reference was found in public source.",
      expected:
        "Public shell uses the official extended Fayette County logo through a controlled component.",
      guideReference: "June 2025 guide, Logo / Logo formats",
      recommendedRemediation: "Add the controlled HabitatLogo component.",
    });
  }

  const imageryFiles = (await walk(path.join(root, "public"))).filter(
    (file) =>
      /\.(?:png|jpe?g|webp|avif|gif)$/i.test(file) && !/logo/i.test(file),
  );
  findings.push({
    ruleId: "IMAGE-001",
    status: imageryFiles.length ? "MANUAL REVIEW" : "NOT APPLICABLE",
    severity: "info",
    source: "public/",
    observed: imageryFiles.length
      ? `${imageryFiles.length} non-logo public image asset(s) require provenance, age, dignity, and alt-text review.`
      : "No non-logo public photographic asset is present.",
    expected:
      "Use authentic approved imagery with contextual alt text; do not use AI-generated photography.",
    guideReference:
      "June 2025 guide, Creative / Our story in images and accessibility",
    recommendedRemediation: imageryFiles.length
      ? "Complete human imagery review per asset."
      : "Keep the image slot empty until approved local/DAN imagery is available.",
  });

  const hasRestore =
    /restore/i.test(publicText) ||
    publicRoutes.some((route) =>
      route?.route.toLowerCase().includes("restore"),
    );
  findings.push({
    ruleId: "RESTORE-001",
    status: hasRestore ? "MANUAL REVIEW" : "NOT APPLICABLE",
    severity: "info",
    source: "public routes and source",
    observed: hasRestore
      ? "ReStore content or route is present and requires the June 2025 ReStore checks."
      : "No ReStore public route or content is implemented in this scaffold.",
    expected:
      "ReStore is treated as the authorized identifier exception; missing May 2024 source rules remain manual review.",
    guideReference: "June 2025 guide, Our ReStores",
    recommendedRemediation: hasRestore
      ? "Audit identifier, clear space, size, color, and relationship to Fayette Habitat; obtain May 2024 guide for remaining rules."
      : "Record as not applicable until a verified ReStore experience is introduced.",
  });

  const programNames = [
    ...publicText.matchAll(
      /\b(?:Aging in Place|Rapid Response|Camp St\. Cottages|ReStore)\b/gi,
    ),
  ].map((match) => match[0]);
  findings.push({
    ruleId: "PROGRAM-001",
    status: programNames.length ? "MANUAL REVIEW" : "NOT APPLICABLE",
    severity: "info",
    source: "public source",
    observed: programNames.length
      ? `Named program/event terms found: ${[...new Set(programNames)].join(", ")}.`
      : "No named program/event identity is present in the implemented public shell.",
    expected:
      "Habitat identity leads; program/event names remain separate headline treatments and are introduced with clear ownership language.",
    guideReference: "June 2025 guide, Logo / Programs and events",
    recommendedRemediation: programNames.length
      ? "Complete route/content review for ownership language and lockup separation."
      : "Record as not applicable until verified program/event content is published.",
  });

  const internalLinks = [
    ...publicText.matchAll(/(?:href|to)=\"(\/[^\"]*)\"/g),
  ].map((match) => match[1]);
  const externalLinks = [...publicText.matchAll(/https?:\/\/[^\"'`\s)]+/g)].map(
    (match) => match[0],
  );
  const invalidLinks = externalLinks.filter((url) =>
    /\.invalid(?:\/|$)/i.test(url),
  );
  findings.push({
    ruleId: "LINK-001",
    status: invalidLinks.length ? "FAIL" : "PASS",
    severity: invalidLinks.length ? "high" : "info",
    source: "public source",
    observed: `${internalLinks.length} static internal href(s), ${externalLinks.length} static external URL(s), ${invalidLinks.length} reserved-host violation(s).`,
    expected:
      "Rendered public links resolve intentionally; no empty hrefs, reserved .invalid hosts, fabricated replacements, or stale CTAs.",
    evidence: invalidLinks.join(", ") || "No static .invalid URL detected.",
    guideReference: "Repository public-link integrity gate",
    recommendedRemediation: invalidLinks.length
      ? "Remove or govern the invalid external destination."
      : "Run rendered link checks against implemented public routes and governed external destinations.",
  });

  const fontFaceCount = (sourceText.match(/@font-face/gi) ?? []).length;
  const computedSummary = {
    phase,
    generatedAt: new Date().toISOString(),
    routeCount: publicRoutes.length,
    fontFaceCount,
    logoReferenceCount: logoReferences.length,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    findings: {
      total: findings.length,
      fail: findingCount(findings, "FAIL"),
      pass: findingCount(findings, "PASS"),
      warning: findingCount(findings, "WARNING"),
      manualReview: findingCount(findings, "MANUAL REVIEW"),
      notApplicable: findingCount(findings, "NOT APPLICABLE"),
    },
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "route-inventory.json"),
    JSON.stringify({ phase, routes: publicRoutes }, null, 2) + "\n",
  );
  await writeFile(
    path.join(outputDir, "typography-audit.json"),
    JSON.stringify(
      {
        phase,
        fontFaceCount,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("TYPE-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "color-audit.json"),
    JSON.stringify(
      {
        phase,
        approvedColors,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("COLOR-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "logo-audit.json"),
    JSON.stringify(
      {
        phase,
        logoReferences,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("LOGO-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "program-event-audit.json"),
    JSON.stringify(
      {
        phase,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("PROGRAM-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "restore-audit.json"),
    JSON.stringify(
      {
        phase,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("RESTORE-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "content-audit.json"),
    JSON.stringify(
      {
        phase,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("COPY-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "imagery-audit.json"),
    JSON.stringify(
      {
        phase,
        assets: imageryFiles.map((file) => path.relative(root, file)),
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("IMAGE-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "link-audit.json"),
    JSON.stringify(
      {
        phase,
        internalLinks,
        externalLinks,
        invalidLinks,
        findings: findings.filter((finding) =>
          finding.ruleId.startsWith("LINK-"),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "accessibility-results.json"),
    JSON.stringify(
      {
        phase,
        status: "MANUAL REVIEW",
        automated: false,
        note: "Static collection records source-level image alt attributes and semantic landmarks; browser axe, keyboard, focus, contrast, and reflow checks are recorded separately.",
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "visual-regression-summary.json"),
    JSON.stringify(
      {
        phase,
        status: "MANUAL REVIEW",
        viewports: ["390x844", "768x900", "1440x900"],
        screenshots: [
          "screenshots/home-desktop.png",
          "screenshots/home-mobile.png",
          "screenshots/news-desktop.png",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "report.json"),
    JSON.stringify({ ...computedSummary, findings }, null, 2) + "\n",
  );
  await writeFile(
    path.join(outputDir, "static-audit.json"),
    JSON.stringify({ ...computedSummary, findings }, null, 2) + "\n",
  );

  const status = computedSummary.findings.fail
    ? "FAIL"
    : computedSummary.findings.manualReview
      ? "MANUAL REVIEW"
      : "PASS";
  const report =
    `# Habitat brand-compliance ${phase} audit\n\n` +
    `- Phase: **${phase}**\n` +
    `- Generated: ${computedSummary.generatedAt}\n` +
    `- Public route definitions: **${computedSummary.routeCount}**\n` +
    `- Font-face declarations: **${fontFaceCount}**\n` +
    `- Static internal links: **${internalLinks.length}**\n` +
    `- Static external URLs: **${externalLinks.length}**\n` +
    `- Overall audit status: **${status}**\n\n` +
    `## Findings\n\n` +
    `| Status | Count |\n| --- | ---: |\n| FAIL | ${computedSummary.findings.fail} |\n| PASS | ${computedSummary.findings.pass} |\n| WARNING | ${computedSummary.findings.warning} |\n| MANUAL REVIEW | ${computedSummary.findings.manualReview} |\n| NOT APPLICABLE | ${computedSummary.findings.notApplicable} |\n\n` +
    `## Evidence\n\n` +
    `Machine-readable detail is in \`report.json\` and the audit-specific JSON files in this directory. Licensed font binaries are intentionally excluded.\n\n` +
    findings
      .map(
        (finding) =>
          `- **${finding.status}** \`${finding.ruleId}\` — ${finding.observed} (${finding.source})`,
      )
      .join("\n") +
    "\n";
  await writeFile(path.join(outputDir, "report.md"), report);

  process.stdout.write(JSON.stringify(computedSummary, null, 2) + "\n");
  if (
    process.env.BRAND_AUDIT_STRICT === "1" &&
    computedSummary.findings.fail > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
