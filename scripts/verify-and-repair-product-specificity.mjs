import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = resolve(ROOT_DIR, "output");
const SPECIFICITY_MANIFEST = resolve(OUTPUT_DIR, "shopify-product-specificity-manifest.json");
const REPAIR_HANDLES_FILE = resolve(OUTPUT_DIR, "product-specificity-category-repair-handles.txt");
const REPAIR_REPORT = resolve(OUTPUT_DIR, "shopify-product-specificity-auto-repair.json");
const VERIFY_SCRIPT = resolve(ROOT_DIR, "scripts", "verify-shopify-product-specificity.mjs");
const BACKFILL_SCRIPT = resolve(ROOT_DIR, "scripts", "shopify-product-metafield-backfill.mjs");

function runNode(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT_DIR,
    env,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function exitCode(result) {
  return Number.isInteger(result?.status) ? result.status : 1;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(SPECIFICITY_MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

async function writeReport(report) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPAIR_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const verificationStartedAt = Date.now();
const initial = runNode(VERIFY_SCRIPT);
if (exitCode(initial) === 0) {
  await writeReport({
    version: 1,
    generatedAt: new Date().toISOString(),
    status: "not-needed",
    reason: "Product specificity verification passed without category failures",
    categoryFailures: 0,
    verificationExitCode: 0,
  });
  process.exit(0);
}

const manifest = await loadManifest();
const manifestGeneratedAt = Date.parse(String(manifest?.generatedAt || ""));
if (!Number.isFinite(manifestGeneratedAt) || manifestGeneratedAt < verificationStartedAt) {
  await writeReport({
    version: 1,
    generatedAt: new Date().toISOString(),
    status: "not-applicable",
    reason: "Specificity verifier failed before producing a fresh manifest; stale evidence was not used for repair",
    categoryFailures: 0,
    verificationExitCode: exitCode(initial),
  });
  process.exit(exitCode(initial));
}

const categoryFailures = (Array.isArray(manifest?.products) ? manifest.products : [])
  .filter((product) => Array.isArray(product?.issues) && product.issues.includes("category:missing"))
  .map((product) => String(product.handle || "").trim())
  .filter(Boolean);

if (!categoryFailures.length) {
  await writeReport({
    version: 1,
    generatedAt: new Date().toISOString(),
    status: "not-applicable",
    reason: "Specificity failed without category:missing issues; original failure is preserved",
    categoryFailures: 0,
    verificationExitCode: exitCode(initial),
  });
  process.exit(exitCode(initial));
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(REPAIR_HANDLES_FILE, `${[...new Set(categoryFailures)].join("\n")}\n`, "utf8");
process.stdout.write(
  `[specificity-repair] ${categoryFailures.length} missing category issue(s); running targeted live category backfill\n`,
);

const repair = runNode(BACKFILL_SCRIPT, [
  "--apply",
  "--categories-only",
  "--skip-live-reviews",
  "--product-handles-file",
  relative(ROOT_DIR, REPAIR_HANDLES_FILE),
], {
  ...process.env,
  // Direct child execution does not inherit npm's canonical release
  // lifecycle name, so point the backfill at the shared catalog boundary.
  SALT_RELEASE_CATALOG_SOURCE_PATH:
    process.env.SALT_RELEASE_CATALOG_SOURCE_PATH || resolve(OUTPUT_DIR, "release-catalog-source.json"),
  // The failed-product handles come from the fresh live specificity export.
  // Reuse the release snapshot for stable IDs and fetch live custom data only
  // for those handles instead of downloading the entire Admin catalog again.
  SALT_BACKFILL_FORCE_LIVE_SELECTED_CATALOG: "0",
  SALT_BACKFILL_USE_CATALOG_CHECKPOINT: "0",
  SALT_BACKFILL_FORCE_LIVE_CUSTOM_DATA_REFRESH: "1",
});

if (exitCode(repair) !== 0) {
  await writeReport({
    version: 1,
    generatedAt: new Date().toISOString(),
    status: "repair-failed",
    categoryFailures: categoryFailures.length,
    handlesFile: REPAIR_HANDLES_FILE,
    verificationExitCode: exitCode(initial),
    repairExitCode: exitCode(repair),
  });
  process.exit(exitCode(repair));
}

process.stdout.write("[specificity-repair] category backfill completed; rerunning full live specificity verification\n");
const final = runNode(VERIFY_SCRIPT);
await writeReport({
  version: 1,
  generatedAt: new Date().toISOString(),
  status: exitCode(final) === 0 ? "repaired" : "repair-verification-failed",
  categoryFailures: categoryFailures.length,
  handlesFile: REPAIR_HANDLES_FILE,
  verificationExitCode: exitCode(initial),
  repairExitCode: exitCode(repair),
  finalVerificationExitCode: exitCode(final),
});
process.exit(exitCode(final));
