#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  applyCollectionReorderMoves,
  buildLiveMembershipTarget,
  buildCollectionReorderMoves,
  shuffleCollectionProductIds,
} from "../src/lib/shopify-collection-shuffle.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const defaultOutputPath = resolve(rootDir, "output", "shopify-collection-shuffle-manifest.json");
const progressOutputPath = resolve(rootDir, "output", "shopify-collection-shuffle-progress.json");
const collectionPageSize = Math.max(1, Math.min(250, Number(process.env.SALT_COLLECTION_SHUFFLE_PAGE_SIZE || 100)));
const productPageSize = 250;
const jobPollMs = Math.max(1000, Number(process.env.SALT_COLLECTION_SHUFFLE_JOB_POLL_MS || 2000));
const jobPollAttempts = Math.max(1, Number(process.env.SALT_COLLECTION_SHUFFLE_JOB_POLL_ATTEMPTS || 300));
// Shopify's reorder job can finish before the collection connection exposes its
// new order. Keep the retry window long enough for large collections without
// issuing another mutation during propagation.
const readbackAttempts = Math.max(1, Number(process.env.SALT_COLLECTION_SHUFFLE_READBACK_ATTEMPTS || 12));
const readbackDelayMs = Math.max(1000, Number(process.env.SALT_COLLECTION_SHUFFLE_READBACK_DELAY_MS || 5000));
const liveBatchReadbackThreshold = Math.max(0, Number(process.env.SALT_COLLECTION_SHUFFLE_LIVE_BATCH_READBACK_THRESHOLD || 1000));
// A completed reorder job is already an ordering checkpoint. For large
// collections, periodically re-read the live connection instead of fetching
// every page after every batch; the final exact readback remains mandatory.
const liveBatchReadbackEvery = Math.max(1, Number(process.env.SALT_COLLECTION_SHUFFLE_LIVE_BATCH_READBACK_EVERY || 8));
const collectionReadConcurrency = Math.max(1, Math.min(8, Number(process.env.SALT_COLLECTION_SHUFFLE_READ_CONCURRENCY || 4)));
const collectionApplyConcurrency = Math.max(1, Math.min(3, Number(process.env.SALT_COLLECTION_SHUFFLE_APPLY_CONCURRENCY || 2)));
const shuffleRequestAttempts = Math.max(1, Math.min(5, Number(process.env.SALT_COLLECTION_SHUFFLE_REQUEST_ATTEMPTS || 3)));
const shuffleRequestRetryDelayMs = Math.max(1000, Math.min(30_000, Number(process.env.SALT_COLLECTION_SHUFFLE_REQUEST_RETRY_DELAY_MS || 15_000)));
const excludedCollectionHandles = new Set(
  String(process.env.SALT_COLLECTION_SHUFFLE_EXCLUDE_HANDLES || "test")
    .split(",")
    .map((handle) => handle.trim().toLowerCase())
    .filter(Boolean),
);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "collection-shuffle" });
const jsonWriteQueues = new Map();

function enqueueJsonWrite(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const previous = jsonWriteQueues.get(path) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeFile(path, content, "utf8"));
  jsonWriteQueues.set(path, next);
  return next;
}

function requestOptions(operation, options = {}) {
  return {
    ...options,
    operation,
    maxAttempts: shuffleRequestAttempts,
    maxRetryDelayMs: shuffleRequestRetryDelayMs,
  };
}

async function writeProgress(patch = {}) {
  await enqueueJsonWrite(progressOutputPath, {
      kind: "salt-collection-shuffle-progress",
      version: 1,
      updatedAt: new Date().toISOString(),
      ...patch,
    });
}

const COLLECTIONS_QUERY = /* GraphQL */ `
  query CollectionShuffleCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes { id handle title sortOrder }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCTS_QUERY = /* GraphQL */ `
  query CollectionShuffleProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      products(first: $first, after: $after) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const SORT_UPDATE_MUTATION = /* GraphQL */ `
  mutation CollectionShuffleSort($id: ID!, $sortOrder: CollectionSortOrder!) {
    collectionUpdate(input: { id: $id, sortOrder: $sortOrder }) {
      collection { id sortOrder }
      userErrors { field message }
    }
  }
`;

const REORDER_MUTATION = /* GraphQL */ `
  mutation CollectionShuffleReorder($id: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $id, moves: $moves) {
      job { id }
      userErrors { field message }
    }
  }
`;

const JOB_QUERY = /* GraphQL */ `
  query CollectionShuffleJob($id: ID!) {
    job(id: $id) { id done }
  }
`;

function parseArgs(argv) {
  const args = { mode: "dry-run", output: defaultOutputPath, seed: process.env.SALT_COLLECTION_SHUFFLE_SEED || "" };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") args.mode = "apply";
    else if (token === "--verify") args.mode = "verify";
    else if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--repair-failed") args.repairFailed = true;
    else if (token === "--output" && argv[index + 1]) args.output = resolve(rootDir, argv[++index]);
    else if (token === "--seed" && argv[index + 1]) args.seed = argv[++index];
  }
  if (!args.seed) args.seed = new Date().toISOString().slice(0, 10);
  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProductIds(ids) {
  return [...new Set(asArray(ids).map((id) => String(id || "")).filter(Boolean))];
}

async function fetchCollections() {
  const collections = [];
  let after = null;
  while (true) {
    const payload = await client.run(COLLECTIONS_QUERY, { first: collectionPageSize, after }, requestOptions("read collections for manual shuffle"));
    collections.push(...asArray(payload?.collections?.nodes));
    if (!payload?.collections?.pageInfo?.hasNextPage) break;
    after = payload.collections.pageInfo.endCursor || null;
    if (!after) throw new Error("Shopify returned a next page without a cursor while reading collections");
  }
  return collections.filter((collection) => !excludedCollectionHandles.has(String(collection.handle || "").toLowerCase()));
}

async function fetchCollectionProducts(collectionId) {
  const ids = [];
  let after = null;
  while (true) {
    const payload = await client.run(PRODUCTS_QUERY, { id: collectionId, first: productPageSize, after }, requestOptions(`read products for collection ${collectionId}`));
    const connection = payload?.collection?.products;
    ids.push(...asArray(connection?.nodes).map((product) => String(product?.id || "")).filter(Boolean));
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor || null;
    if (!after) throw new Error(`Collection ${collectionId} returned a next page without a cursor`);
  }
  return ids;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
      completed += 1;
      if (completed % 10 === 0 || completed === items.length) {
        process.stdout.write(`Collection shuffle read progress: ${completed}/${items.length}.\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function buildPlan(seed) {
  const collections = await fetchCollections();
  return mapWithConcurrency(collections, collectionReadConcurrency, async (collection) => {
    const currentIds = await fetchCollectionProducts(collection.id);
    const desiredIds = shuffleCollectionProductIds(currentIds, `${seed}:${collection.handle}`);
    const moves = buildCollectionReorderMoves(currentIds, desiredIds);
    return {
      id: collection.id,
      handle: collection.handle,
      title: collection.title,
      currentSortOrder: collection.sortOrder || "UNKNOWN",
      desiredSortOrder: "MANUAL",
      productCount: currentIds.length,
      currentIds,
      desiredIds,
      moves,
      needsReorder: currentIds.join("|") !== desiredIds.join("|"),
    };
  });
}

async function waitForJob(jobId, { onPoll } = {}) {
  if (!jobId) return;
  for (let attempt = 0; attempt < jobPollAttempts; attempt += 1) {
    await onPoll?.({
      jobId,
      attempt: attempt + 1,
      maxAttempts: jobPollAttempts,
    });
    const payload = await client.run(JOB_QUERY, { id: jobId }, requestOptions(`wait for collection reorder job ${jobId}`));
    if (payload?.job?.done === true) {
      await onPoll?.({
        jobId,
        attempt: attempt + 1,
        maxAttempts: jobPollAttempts,
        done: true,
      });
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, jobPollMs));
  }
  throw new Error(`Collection reorder job ${jobId} did not finish within the verification window`);
}

async function applyCollection(entry, { onBatchComplete, onJobPoll } = {}) {
  if (entry.currentSortOrder !== "MANUAL") {
    const payload = await client.run(
      SORT_UPDATE_MUTATION,
      { id: entry.id, sortOrder: "MANUAL" },
      requestOptions(`set manual sort for ${entry.handle}`, { allowMutations: true }),
    );
    const errors = asArray(payload?.collectionUpdate?.userErrors);
    if (errors.length) throw new Error(`${entry.handle}: ${JSON.stringify(errors)}`);
  }

  // Always start from Shopify's live order. This makes a resumed apply safe if
  // a previous process completed a reorder before its checkpoint was written.
  let currentIds = normalizeProductIds(await fetchCollectionProducts(entry.id));
  let targetIds = buildLiveMembershipTarget(currentIds, entry.desiredIds);
  let membershipDrift = {
    missingFromLive: normalizeProductIds(entry.desiredIds).filter((id) => !new Set(currentIds).has(id)),
    newlyLive: currentIds.filter((id) => !new Set(entry.desiredIds).has(id)),
  };
  const maxReorderBatches = Math.max(4, Math.ceil(Math.max(currentIds.length, targetIds.length) / 250) * 4);
  let reorderBatches = 0;
  while (currentIds.join("|") !== targetIds.join("|")) {
    reorderBatches += 1;
    if (reorderBatches > maxReorderBatches) {
      throw new Error(`${entry.handle}: exceeded ${maxReorderBatches} live reorder batches without converging`);
    }
    let moves = buildCollectionReorderMoves(currentIds, targetIds);
    if (!moves.length) {
      // A long-running collection can change membership while reorder jobs are
      // in flight. Rebuild both arrays from Shopify before treating the state
      // as irrecoverable; never emit an invalid or guessed move.
      const refreshedIds = normalizeProductIds(await fetchCollectionProducts(entry.id));
      const refreshedTargetIds = buildLiveMembershipTarget(refreshedIds, entry.desiredIds);
      const plannedSet = new Set(normalizeProductIds(entry.desiredIds));
      const refreshedSet = new Set(refreshedIds);
      membershipDrift = {
        missingFromLive: [...new Set([
          ...membershipDrift.missingFromLive,
          ...normalizeProductIds(entry.desiredIds).filter((id) => !refreshedSet.has(id)),
        ])],
        newlyLive: [...new Set([
          ...membershipDrift.newlyLive,
          ...refreshedIds.filter((id) => !plannedSet.has(id)),
        ])],
      };
      currentIds = refreshedIds;
      targetIds = refreshedTargetIds;
      moves = buildCollectionReorderMoves(currentIds, targetIds);
      if (!moves.length && currentIds.join("|") !== targetIds.join("|")) {
        throw new Error(
          `Unable to build a reorder move for ${entry.handle}; live membership changed during reorder `
          + `(current=${currentIds.length}, target=${targetIds.length}, `
          + `missing=${membershipDrift.missingFromLive.length}, newlyLive=${membershipDrift.newlyLive.length})`,
        );
      }
    }
    if (!moves.length) break;
    const payload = await client.run(
      REORDER_MUTATION,
      // Shopify models newPosition as UnsignedInt64, which the Admin GraphQL
      // CLI requires to be encoded as a string even for small positions.
      { id: entry.id, moves: moves.map((move) => ({ ...move, newPosition: String(move.newPosition) })) },
      requestOptions(`shuffle collection ${entry.handle}`, { allowMutations: true }),
    );
    const errors = asArray(payload?.collectionReorderProducts?.userErrors);
    if (errors.length) throw new Error(`${entry.handle}: ${JSON.stringify(errors)}`);
    const jobId = payload?.collectionReorderProducts?.job?.id;
    await onJobPoll?.({
      jobId,
      batch: reorderBatches,
      maxBatches: maxReorderBatches,
      phase: "job-started",
    });
    await waitForJob(jobId, {
      onPoll: async ({ attempt, maxAttempts, done }) => onJobPoll?.({
        jobId,
        batch: reorderBatches,
        maxBatches: maxReorderBatches,
        phase: done ? "job-complete" : "job-polling",
        jobAttempt: attempt,
        jobMaxAttempts: maxAttempts,
      }),
    });
    // For small collections, mirroring the completed job avoids an extra
    // connection read. Large collections can expose a partially applied order
    // at position boundaries, so recompute every next batch from live Shopify
    // state instead of trusting a local mirror.
    if (
      liveBatchReadbackThreshold > 0 &&
      currentIds.length >= liveBatchReadbackThreshold &&
      reorderBatches % liveBatchReadbackEvery === 0
    ) {
      const refreshedIds = normalizeProductIds(await fetchCollectionProducts(entry.id));
      const refreshedTargetIds = buildLiveMembershipTarget(refreshedIds, entry.desiredIds);
      const plannedSet = new Set(normalizeProductIds(entry.desiredIds));
      const refreshedSet = new Set(refreshedIds);
      membershipDrift = {
        missingFromLive: [...new Set([
          ...membershipDrift.missingFromLive,
          ...normalizeProductIds(entry.desiredIds).filter((id) => !refreshedSet.has(id)),
        ])],
        newlyLive: [...new Set([
          ...membershipDrift.newlyLive,
          ...refreshedIds.filter((id) => !plannedSet.has(id)),
        ])],
      };
      currentIds = refreshedIds;
      targetIds = refreshedTargetIds;
    } else {
      currentIds = applyCollectionReorderMoves(currentIds, moves);
    }
    await onBatchComplete?.({
      batch: reorderBatches,
      maxBatches: maxReorderBatches,
      moveCount: moves.length,
      remaining: currentIds.length,
    });
  }

  let actualIds = [];
  for (let attempt = 1; attempt <= readbackAttempts; attempt += 1) {
    actualIds = await fetchCollectionProducts(entry.id);
    const actualTargetIds = buildLiveMembershipTarget(actualIds, targetIds);
    if (actualIds.join("|") === actualTargetIds.join("|")) {
      return membershipDrift;
    }
    if (attempt < readbackAttempts) {
      const retryDelayMs = Math.min(30_000, readbackDelayMs * Math.max(1, Math.ceil(attempt / 3)));
      process.stdout.write(
        `${entry.handle}: order readback pending (${attempt}/${readbackAttempts}); retrying in ${Math.round(retryDelayMs / 1000)}s\n`,
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, retryDelayMs));
    }
  }
  throw new Error(`${entry.handle}: manual order readback mismatch after ${readbackAttempts} attempts`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "verify") {
    const prior = JSON.parse(await readFile(args.output, "utf8"));
    const plan = await buildPlan(prior.seed);
    const failures = [];
    for (const entry of plan) {
      const expected = prior.collections?.find((candidate) => candidate.handle === entry.handle);
      if (!expected) {
        failures.push({ handle: entry.handle, reason: "collection-not-in-prior-manifest" });
        continue;
      }
      if (entry.currentSortOrder !== "MANUAL") failures.push({ handle: entry.handle, reason: "sort-order-not-manual", actual: entry.currentSortOrder });
      const expectedOrder = buildLiveMembershipTarget(entry.currentIds, expected.desiredIds);
      if (entry.currentIds.join("|") !== expectedOrder.join("|")) failures.push({ handle: entry.handle, reason: "order-readback-mismatch" });
    }
    const report = { ...prior, mode: "verify", verifiedAt: new Date().toISOString(), failures };
    await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (failures.length) throw new Error(`Collection shuffle verification failed for ${failures.length} collection(s)`);
    process.stdout.write(`Collection shuffle verification passed: ${plan.length} collections, zero order mismatches.\n`);
    return;
  }
  let priorManifest = null;
  if (args.mode === "apply") {
    try {
      priorManifest = JSON.parse(await readFile(args.output, "utf8"));
    } catch {
      priorManifest = null;
    }
  }
  const hasReusablePriorPlan = Boolean(
    priorManifest?.seed === args.seed &&
      Array.isArray(priorManifest.collections) &&
      priorManifest.collections.length,
  );
  let canReusePriorPlan = hasReusablePriorPlan;
  let plan;
  if (args.repairFailed) {
    if (args.mode !== "apply" || !hasReusablePriorPlan) {
      throw new Error("--repair-failed requires --apply and a same-seed shuffle manifest.");
    }
    const failedHandles = new Set(
      asArray(priorManifest.failures)
        .filter((failure) => ["order-readback-mismatch", "apply-failed"].includes(failure?.reason))
        .map((failure) => failure.handle),
    );
    if (!failedHandles.size) throw new Error("--repair-failed found no order-readback failures in the shuffle manifest.");
    const repairedPlan = [];
    for (const entry of priorManifest.collections) {
      if (!failedHandles.has(entry.handle)) {
        repairedPlan.push(entry);
        continue;
      }
      process.stdout.write(`Rebuilding live shuffle plan for failed collection ${entry.handle}\n`);
      const currentIds = await fetchCollectionProducts(entry.id);
      const desiredIds = shuffleCollectionProductIds(currentIds, `${args.seed}:${entry.handle}`);
      repairedPlan.push({
        ...entry,
        currentIds,
        desiredIds,
        moves: buildCollectionReorderMoves(currentIds, desiredIds),
        productCount: currentIds.length,
        needsReorder: currentIds.join("|") !== desiredIds.join("|"),
      });
    }
    priorManifest = {
      ...priorManifest,
      collections: repairedPlan,
      failures: [],
      appliedCollections: asArray(priorManifest.appliedCollections).filter((handle) => !failedHandles.has(handle)),
    };
    plan = repairedPlan;
  } else {
    plan = hasReusablePriorPlan
      ? priorManifest.collections.filter((entry) => !excludedCollectionHandles.has(String(entry.handle || "").toLowerCase()))
      : await buildPlan(args.seed);
  }
  const manifest = canReusePriorPlan
    ? {
        ...priorManifest,
        mode: args.mode,
        resumedAt: new Date().toISOString(),
        collections: plan,
        appliedCollections: asArray(priorManifest.appliedCollections).filter(
          (handle) => !excludedCollectionHandles.has(String(handle || "").toLowerCase()),
        ),
        excludedCollectionHandles: [...excludedCollectionHandles],
      }
    : {
        generatedAt: new Date().toISOString(),
        mode: args.mode,
        seed: args.seed,
        policy: {
          sortOrder: "MANUAL",
          seed: "one deterministic shuffle per collection per seed; the daily release supplies a new date seed",
          mutationLimit: 250,
          readback: "every collection order is read back after asynchronous reorder jobs finish",
          liveBatchReadbackEvery,
          resume: "reuse the same date-seeded plan and begin each collection from live Shopify order",
        },
        summary: {
          collections: plan.length,
          collectionsRequiringManualSort: plan.filter((entry) => entry.currentSortOrder !== "MANUAL").length,
          collectionsRequiringReorder: plan.filter((entry) => entry.needsReorder).length,
          productsCovered: plan.reduce((sum, entry) => sum + entry.productCount, 0),
        },
        collections: plan,
        failures: [],
        excludedCollectionHandles: [...excludedCollectionHandles],
      };
  await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (args.mode === "dry-run") {
    process.stdout.write(`Collection shuffle dry-run complete: ${manifest.summary.collections} collections, ${manifest.summary.collectionsRequiringReorder} order changes.\n`);
    return;
  }

  const appliedCollections = new Set(manifest.appliedCollections || []);
  manifest.inFlightCollections = { ...(manifest.inFlightCollections || {}) };

  await mapWithConcurrency(
    plan,
    collectionApplyConcurrency,
    async (entry, index) => {
      if (appliedCollections.has(entry.handle)) return;
      process.stdout.write(`Shuffle progress: ${appliedCollections.size}/${plan.length} starting ${entry.handle}\n`);
      manifest.inFlightCollections[entry.handle] = {
        collectionId: entry.id,
        batch: 0,
        maxBatches: 0,
        phase: "starting",
        jobId: "",
        jobAttempt: 0,
        jobMaxAttempts: jobPollAttempts,
        lastAttemptAt: new Date().toISOString(),
      };
      await enqueueJsonWrite(args.output, manifest);
      await writeProgress({
        status: "running",
        handle: entry.handle,
        collectionId: entry.id,
        batch: 0,
        maxBatches: 0,
        phase: "starting",
        activeHandles: Object.keys(manifest.inFlightCollections),
      });
      try {
        const membershipDrift = await applyCollection(entry, {
          onJobPoll: async ({ jobId, batch, maxBatches, phase, jobAttempt = 0, jobMaxAttempts = jobPollAttempts }) => {
            const inFlight = manifest.inFlightCollections[entry.handle] || {};
            Object.assign(inFlight, {
              collectionId: entry.id,
              batch,
              maxBatches,
              phase,
              jobId: String(jobId || ""),
              jobAttempt,
              jobMaxAttempts,
              lastPolledAt: new Date().toISOString(),
            });
            manifest.inFlightCollections[entry.handle] = inFlight;
            await enqueueJsonWrite(args.output, manifest);
            await writeProgress({
              status: "running",
              handle: entry.handle,
              collectionId: entry.id,
              batch,
              maxBatches,
              phase,
              jobId: String(jobId || ""),
              jobAttempt,
              jobMaxAttempts,
              activeHandles: Object.keys(manifest.inFlightCollections),
            });
          },
          onBatchComplete: async ({ batch, maxBatches, moveCount, remaining }) => {
            const inFlight = manifest.inFlightCollections[entry.handle] || {};
            Object.assign(inFlight, {
              batch,
              maxBatches,
              moveCount,
              remaining,
              phase: "batch-complete",
              progressAt: new Date().toISOString(),
            });
            manifest.inFlightCollections[entry.handle] = inFlight;
            await enqueueJsonWrite(args.output, manifest);
            process.stdout.write(
              `Shuffle progress: ${appliedCollections.size}/${plan.length} ${entry.handle} batch ${batch}/${maxBatches} (${moveCount} moves)\n`,
            );
          },
        });
        appliedCollections.add(entry.handle);
        manifest.appliedCollections = plan
          .filter((candidate) => appliedCollections.has(candidate.handle))
          .map((candidate) => candidate.handle);
        delete manifest.inFlightCollections[entry.handle];
        manifest.lastError = "";
        manifest.failures = (manifest.failures || []).filter((failure) => failure?.handle !== entry.handle);
        if (!manifest.failures.length) manifest.failedAt = "";
        if (membershipDrift.missingFromLive.length || membershipDrift.newlyLive.length) {
          manifest.membershipDrift = [
            ...(manifest.membershipDrift || []).filter((drift) => drift?.handle !== entry.handle),
            { handle: entry.handle, ...membershipDrift },
          ];
        }
        await writeProgress({
          // A per-collection completion is not the end of the shuffle when
          // another bounded worker is still active or work remains queued.
          status: "running",
          handle: entry.handle,
          collectionId: entry.id,
          activeHandles: Object.keys(manifest.inFlightCollections),
        });
        await enqueueJsonWrite(args.output, manifest);
        process.stdout.write(`Shuffle progress: ${appliedCollections.size}/${plan.length} verified ${entry.handle}\n`);
      } catch (error) {
        const detail = String(error?.message || error);
        manifest.lastError = detail;
        manifest.failedAt = new Date().toISOString();
        manifest.failures = [
          ...(manifest.failures || []).filter((failure) => failure?.handle !== entry.handle),
          { handle: entry.handle, reason: "apply-failed", error: detail },
        ];
        await enqueueJsonWrite(args.output, manifest);
        await writeProgress({
          status: "failed",
          handle: entry.handle,
          collectionId: entry.id,
          batch: manifest.inFlightCollections[entry.handle]?.batch || 0,
          phase: manifest.inFlightCollections[entry.handle]?.phase || "failed",
          error: detail,
          activeHandles: Object.keys(manifest.inFlightCollections),
        });
        throw error;
      }
    },
  );
  delete manifest.inFlightCollections;
  manifest.completedAt = new Date().toISOString();
  await enqueueJsonWrite(args.output, manifest);
  await writeProgress({
    status: "completed",
    handle: "",
    collectionId: "",
    activeHandles: [],
    completedAt: manifest.completedAt,
  });
  process.stdout.write(`Collection shuffle complete: ${manifest.appliedCollections?.length || 0} collections manually sorted and read back.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
