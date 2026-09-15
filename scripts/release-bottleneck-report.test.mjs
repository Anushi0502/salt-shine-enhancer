import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseBottleneckReport,
  classifyReleaseBottleneck,
  recommendReleaseOptimization,
} from "./release-bottleneck-report.mjs";

test("classifies remote and local release bottlenecks", () => {
  assert.equal(classifyReleaseBottleneck({ label: "Reconcile Shopify SEO" }), "shopify-io");
  assert.equal(classifyReleaseBottleneck({ label: "Run local Metal visual taxonomy model" }), "local-model");
  assert.equal(classifyReleaseBottleneck({ label: "Build web app" }), "build");
  assert.equal(classifyReleaseBottleneck({ label: "Generate Shopify theme bundle" }), "build");
});

test("builds a ranked report with pending and measured steps", () => {
  const report = buildReleaseBottleneckReport({
    steps: [
      { label: "Fast local check", command: "node" },
      { label: "Reconcile Shopify SEO", command: "npm" },
      { label: "Apply collection merge", command: "node" },
    ],
    completedSteps: [
      { index: 1, label: "Fast local check", durationMs: 500 },
      { index: 2, label: "Reconcile Shopify SEO", durationMs: 1_200_000 },
    ],
    releaseState: { profile: "catalog", status: "paused", stepIndex: 3 },
  });

  assert.equal(report.totalSteps, 3);
  assert.equal(report.measuredStepCount, 2);
  assert.equal(report.topBottlenecks[0].index, 2);
  assert.equal(report.steps[2].status, "pending");
  assert.match(recommendReleaseOptimization({ label: "Apply approved merge" }), /checkpointed bounded/i);
});
