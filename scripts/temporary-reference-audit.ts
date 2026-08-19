import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ReferenceManifest = {
  status: string;
  productionUse: boolean;
  assets: Array<{ path: string; replacementRequired: boolean }>;
};

const manifestPath = resolve(process.cwd(), "public/reference/manifest.json");
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as ReferenceManifest;

if (manifest.status !== "TEMPORARY_EXTERNAL_REFERENCE") {
  throw new Error("Reference manifest must remain explicitly temporary.");
}

if (
  manifest.productionUse ||
  manifest.assets.some((asset) => !asset.replacementRequired)
) {
  throw new Error(
    "Temporary reference imagery cannot be marked production-ready.",
  );
}

console.log(
  `BLOCKED FOR PRODUCTION: ${manifest.assets.length} temporary external reference asset(s) require replacement.`,
);
