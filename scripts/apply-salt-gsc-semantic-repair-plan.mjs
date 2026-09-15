#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  buildLiveFingerprint,
  buildReleaseFingerprint,
  normalizeComparableHtml,
} from "../src/lib/shopify-seo-release.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const manifestPath = resolve(rootDir, "output", "salt-gsc-semantic-repair-seo-plan-2026-09-14.json");
const outputPath = resolve(rootDir, "output", "salt-gsc-semantic-repair-apply-manifest-2026-09-14.json");
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "gsc-semantic-repair" });
const execFileAsync = promisify(execFile);

const PRODUCT_SELECTION = /* GraphQL */ `
  id
  legacyResourceId
  handle
  title
  descriptionHtml
  productType
  tags
  category { id }
  seo { title description }
  variants(first: 250) {
    nodes { id title sku price compareAtPrice }
    pageInfo { hasNextPage endCursor }
  }
  media(first: 250) {
    nodes {
      __typename
      ... on MediaImage { id alt image { url } }
    }
    pageInfo { hasNextPage endCursor }
  }
`;

const PRODUCT_QUERY = /* GraphQL */ `
  query GscSemanticRepairProduct($identifier: ProductIdentifierInput!) {
    productByIdentifier(identifier: $identifier) { ${PRODUCT_SELECTION} }
  }
`;

const PRODUCT_UPDATE_MUTATION = /* GraphQL */ `
  mutation GscSemanticRepairProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id handle title descriptionHtml productType seo { title description } }
      userErrors { field message }
    }
  }
`;

const MEDIA_UPDATE_MUTATION = /* GraphQL */ `
  mutation GscSemanticRepairMediaUpdate($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media { id alt }
      userErrors { field message }
    }
  }
`;

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return text(value).toLowerCase();
}

function buildProtectedTagsFingerprint(product) {
  const tags = Array.isArray(product?.tags)
    ? product.tags.map((tag) => String(tag)).sort()
    : [];
  return buildReleaseFingerprint({ tags });
}

function productInputFromPlan(product) {
  return {
    id: product.productId,
    title: product.desired.title,
    descriptionHtml: product.desired.descriptionHtml,
    productType: product.desired.productType,
    seo: {
      title: product.desired.seo.title,
      description: product.desired.seo.description,
    },
  };
}

function mediaInputsFromPlan(product, live) {
  const ids = product.changedFields
    .filter((field) => field.startsWith("image-alt:"))
    .map((field) => field.slice("image-alt:".length));
  const mediaNodes = Array.isArray(live?.media?.nodes) ? live.media.nodes : [];
  const mediaById = new Map(mediaNodes.map((media) => [String(media.id), media]));
  const unresolved = ids.filter((id) => !mediaById.has(id));
  if (unresolved.length) {
    throw new Error(`${product.handle}: manifest media IDs missing in live read: ${unresolved.join(", ")}`);
  }
  return ids.map((id) => ({ id, alt: product.desired.mediaAlt }));
}

function desiredProductMatches(product, live) {
  const desired = product.desired;
  return normalizeText(live?.title) === normalizeText(desired.title) &&
    normalizeComparableHtml(live?.descriptionHtml) === normalizeComparableHtml(desired.descriptionHtml) &&
    normalizeText(live?.productType) === normalizeText(desired.productType) &&
    normalizeText(live?.seo?.title) === normalizeText(desired.seo.title) &&
    normalizeText(live?.seo?.description) === normalizeText(desired.seo.description);
}

function desiredMediaMatches(product, live) {
  const mediaIds = new Set(product.changedFields
    .filter((field) => field.startsWith("image-alt:"))
    .map((field) => field.slice("image-alt:".length)));
  const mediaNodes = Array.isArray(live?.media?.nodes) ? live.media.nodes : [];
  return [...mediaIds].every((id) => {
    const media = mediaNodes.find((entry) => String(entry.id) === id);
    return media && normalizeText(media.alt) === normalizeText(product.desired.mediaAlt);
  });
}

function userErrorText(errors) {
  return (Array.isArray(errors) ? errors : [])
    .map((error) => `${Array.isArray(error?.field) ? error.field.join(".") : ""} ${error?.message || "Shopify user error"}`.trim())
    .join("; ");
}

async function readProduct(handle) {
  const payload = await client.run(PRODUCT_QUERY, { identifier: { handle } }, {
    operation: `GSC semantic repair read ${handle}`,
  });
  const product = payload?.productByIdentifier;
  if (!product?.id) throw new Error(`Product handle not found in Shopify: ${handle}`);
  return product;
}

async function writeProduct(product) {
  const payload = await client.run(PRODUCT_UPDATE_MUTATION, { product: productInputFromPlan(product) }, {
    allowMutations: true,
    operation: `GSC semantic repair product update ${product.handle}`,
  });
  const errors = payload?.productUpdate?.userErrors || [];
  if (errors.length) throw new Error(`${product.handle}: product update failed: ${userErrorText(errors)}`);
}

async function writeMedia(product, live) {
  const media = mediaInputsFromPlan(product, live);
  if (!media.length) return;
  const payload = await client.run(MEDIA_UPDATE_MUTATION, { productId: live.id, media }, {
    allowMutations: true,
    operation: `GSC semantic repair image-alt update ${product.handle}`,
  });
  const errors = payload?.productUpdateMedia?.userErrors || [];
  if (errors.length) throw new Error(`${product.handle}: image-alt update failed: ${userErrorText(errors)}`);
}

async function readReleaseState() {
  try {
    return JSON.parse(await readFile(resolve(rootDir, "output", "release-run-state.json"), "utf8"));
  } catch {
    return null;
  }
}

async function readWatcherState() {
  try {
    return JSON.parse(await readFile(resolve(rootDir, "output", "realtime-release-watcher-state.json"), "utf8"));
  } catch {
    return null;
  }
}

async function isProcessAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    await execFileAsync("ps", ["-p", String(numericPid), "-o", "command="], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function assertNoActiveFullRelease(releaseState, watcherState) {
  const releaseRunning = releaseState?.status === "running";
  // A terminal release can leave the watcher's stage label stale until its
  // next heartbeat. Treat the terminal release state as authoritative for
  // that label; live tracked PIDs below still protect against a real retry.
  const watcherRunning = watcherState?.releaseStatus === "running" || (
    releaseState?.status !== "failed" && watcherState?.releaseStageStatus === "running"
  );
  const trackedPids = [releaseState?.pid, watcherState?.activeReleasePid, watcherState?.releaseStageChildPid]
    .map(Number)
    .filter((pid, index, values) => Number.isInteger(pid) && pid > 0 && values.indexOf(pid) === index);
  const livePids = [];
  for (const pid of trackedPids) {
    if (await isProcessAlive(pid)) livePids.push(pid);
  }
  if (releaseRunning || watcherRunning || livePids.length) {
    const stateLabel = releaseState?.status === "running"
      ? `release step ${releaseState.stepIndex}/${releaseState.totalSteps}`
      : watcherState?.releaseStatus === "running"
        ? `watcher release step ${watcherState.releaseStepIndex}/${watcherState.releaseTotalSteps}`
        : "tracked release process";
    throw new Error(`Full release is still active (${stateLabel}; live PIDs: ${livePids.join(", ") || "state only"}); targeted writes remain gated.`);
  }
}

function assertMutationScope(manifest) {
  const summary = manifest?.summary || {};
  if (manifest?.scope !== "Exact 12 GSC semantic-repair products") throw new Error("Unexpected repair manifest scope.");
  if (Number(summary.products) !== 12 || Number(summary.currentLiveReadProducts) !== 12) throw new Error("Repair manifest must contain exactly 12 products.");
  if (summary.pricesOrVariantsChanged !== false) throw new Error("Repair manifest is not price/variant safe.");
  if (Number(summary.totalWrites) !== 164) throw new Error(`Unexpected planned write count: ${summary.totalWrites}`);
  for (const product of manifest.products || []) {
    const desired = JSON.stringify(product.desired || {}).toLowerCase();
    if (/\bshirt\b|\bmakeup\b/.test(desired)) throw new Error(`Incorrect semantic label remains in desired copy: ${product.handle}`);
    if (product.unresolved?.length) throw new Error(`Unresolved target in manifest: ${product.handle}`);
    if (!product.current?.productType || !product.desired?.productType) throw new Error(`Missing product type in manifest: ${product.handle}`);
    if (!product.liveTagsFingerprint) throw new Error(`Missing protected tag fingerprint in manifest: ${product.handle}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertMutationScope(manifest);

  const releaseState = await readReleaseState();
  const watcherState = await readWatcherState();
  if (args.apply) await assertNoActiveFullRelease(releaseState, watcherState);

  const startedAt = new Date().toISOString();
  const results = [];
  for (const product of manifest.products) {
    const live = await readProduct(product.handle);
    const alreadyDone = desiredProductMatches(product, live) && desiredMediaMatches(product, live);
    const originalFingerprintMatches = buildLiveFingerprint(live) === product.liveFingerprint;
    const originalTagsFingerprintMatches = buildProtectedTagsFingerprint(live) === product.liveTagsFingerprint;
    if (!alreadyDone && (!originalFingerprintMatches || !originalTagsFingerprintMatches)) {
      throw new Error(`Live product changed after the fresh plan; regenerate before writing: ${product.handle}`);
    }

    const mediaInputs = mediaInputsFromPlan(product, live);
    if (!args.apply || alreadyDone) {
      results.push({ handle: product.handle, status: alreadyDone ? "already-verified" : "dry-run-ready", productMutation: !alreadyDone, mediaWrites: alreadyDone ? 0 : mediaInputs.length });
      continue;
    }

    await writeProduct(product);
    let afterProduct = await readProduct(product.handle);
    if (!desiredProductMatches(product, afterProduct)) throw new Error(`Product readback mismatch after write: ${product.handle}`);
    await writeMedia(product, afterProduct);
    const verified = await readProduct(product.handle);
    if (!desiredProductMatches(product, verified) || !desiredMediaMatches(product, verified)) {
      throw new Error(`Final Admin readback mismatch after write: ${product.handle}`);
    }
    results.push({ handle: product.handle, status: "applied-and-verified", productMutation: true, mediaWrites: mediaInputs.length });
  }

  const output = {
    planPath: manifestPath,
    startedAt,
    completedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    status: args.apply ? "applied-and-verified" : "dry-run-ready",
    releaseStateAtStart: releaseState,
    watcherStateAtStart: watcherState,
    summary: {
      products: results.length,
      applied: results.filter((entry) => entry.status === "applied-and-verified").length,
      alreadyVerified: results.filter((entry) => entry.status === "already-verified").length,
      dryRunReady: results.filter((entry) => entry.status === "dry-run-ready").length,
      mediaWrites: results.reduce((total, entry) => total + entry.mediaWrites, 0),
    },
    results,
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
