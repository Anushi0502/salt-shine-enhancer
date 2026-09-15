import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTagsAddBatchMutation,
  mergeProgressSnapshot,
} from "./shopify-collection-merges-apply.mjs";

test("merge progress snapshots are resumable and deterministic", () => {
  const snapshot = mergeProgressSnapshot({
    phase: "adding-tags",
    total: 3,
    completedIds: new Set(["gid://shopify/Product/30", "gid://shopify/Product/10"]),
    concurrency: 4,
    verified: 1,
  });

  assert.deepEqual(snapshot.completedProductIds, [
    "gid://shopify/Product/10",
    "gid://shopify/Product/30",
  ]);
  assert.equal(snapshot.totalTasks, 3);
  assert.equal(snapshot.completedTasks, 2);
  assert.equal(snapshot.pendingTasks, 1);
  assert.equal(snapshot.verifiedTasks, 1);
  assert.equal(snapshot.concurrency, 4);
  assert.match(snapshot.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("builds aliased tagsAdd mutations with one variable pair per product", () => {
  const mutation = buildTagsAddBatchMutation([
    { productId: "gid://shopify/Product/10", tagsToAdd: ["health-wellness"] },
    { productId: "gid://shopify/Product/20", tagsToAdd: ["travel-outdoor", "gifts"] },
  ]);

  assert.match(mutation.query, /mutation MergeTagsAddBatch\(/);
  assert.match(mutation.query, /p0: tagsAdd\(id: \$id0, tags: \$tags0\)/);
  assert.match(mutation.query, /p1: tagsAdd\(id: \$id1, tags: \$tags1\)/);
  assert.deepEqual(mutation.variables, {
    id0: "gid://shopify/Product/10",
    tags0: ["health-wellness"],
    id1: "gid://shopify/Product/20",
    tags1: ["travel-outdoor", "gifts"],
  });
});
