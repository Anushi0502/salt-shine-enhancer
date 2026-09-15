import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseSteps,
  findReleaseGraphDrift,
  getReleaseRepairRoute,
  isNetworkFailureText,
  isRetryableStageFailure,
  isRemoteReleaseStage,
  releaseStepFingerprint,
  shouldRepairKnowledgeModel,
} from "./release.mjs";
import { validateCollectionGovernance, validateReleaseTarget } from "./release-preflight.mjs";
import { recommendedConcurrency } from "./lib/performance-runtime.mjs";
import { SEMANTIC_COLLECTION_POLICIES } from "../src/lib/catalog-collection-governance.js";
import { addApprovedSemanticAliasMemberships } from "./repair-shopify-governed-collection-sources.mjs";

test("recognizes transient transport failures but not semantic Shopify errors", () => {
  assert.equal(isNetworkFailureText("getaddrinfo EAI_AGAIN Shopify host"), true);
  assert.equal(isNetworkFailureText("Admin GraphQL HTTP 503: service unavailable"), true);
  assert.equal(isNetworkFailureText("collectionUpdate userErrors: invalid sort order"), false);
  assert.equal(isRetryableStageFailure("bulk operation did not finish before the timeout"), true);
  assert.equal(isRetryableStageFailure("readback pending while Shopify propagates membership"), true);
  assert.equal(isRetryableStageFailure("collectionUpdate userErrors: invalid sort order"), false);
});

test("only probes remote release stages", () => {
  assert.equal(isRemoteReleaseStage("npm", ["run", "sync:data"]), true);
  assert.equal(isRemoteReleaseStage("npm", ["run", "shopify:collections:shuffle:apply"]), true);
  assert.equal(isRemoteReleaseStage("npm", ["run", "build:web:release"]), false);
});

test("repairs only the exact current knowledge-model fingerprint drift", () => {
  assert.equal(
    shouldRepairKnowledgeModel(
      "Verify trained 128M-record catalog knowledge model",
      "Catalog knowledge model training fingerprint does not match the checked-in taxonomy.",
    ),
    true,
  );
  assert.equal(
    shouldRepairKnowledgeModel(
      "Verify trained 128M-record catalog knowledge model",
      "Catalog knowledge model validation contains unresolved representatives.",
    ),
    false,
  );
});

test("validates the SALT target and current governed collection registry", () => {
  assert.equal(validateReleaseTarget().host, "0309d3-72.myshopify.com");
  const governance = validateCollectionGovernance();
  assert.equal(governance.status, "verified");
  assert.equal(governance.readOnlyLiveCollections.includes("test"), true);
  assert.equal(governance.requiredPolicies >= 30, true);
});

test("repair routes rewind known failed gates to their guarded prerequisite", () => {
  const steps = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "daily" });
  const labels = steps.map((step) => step.label);
  const cases = [
    ["Validate refreshed catalog taxonomy", "taxonomy override validation failed", "Regenerate catalog taxonomy and preserved-tag audit"],
    ["Require image-backed taxonomy evidence", "visual classification review failed", "Build visual taxonomy review queue"],
    ["Apply exact full-catalog collection reconciliation", "collection membership mismatch", "Dry-run exact full-catalog collection reconciliation"],
    ["Verify exact collection membership and price rules", "collectionless product found", "Apply final current-generation collection reconciliation"],
    ["Verify every active product has product-specific SEO and metafields", "product-specificity verification failed", "Reconcile and verify Shopify SEO/product fields"],
    ["Verify full-catalog cost-band variant pricing and compare-at values", "variant price readback mismatch", "Dry-run full-catalog cost-band variant pricing"],
    ["Verify variant-aware SEO profiles for every active variant", "variant SEO readback mismatch", "Reconcile variant-aware SEO profiles after final catalog writes"],
    ["Verify daily manual collection shuffle", "shuffle order readback mismatch", "Dry-run daily manual collection shuffle"],
    ["Strict live audit of repaired collection classification", "collection source audit failed", "Repair final governed collection sources before strict audit"],
    ["Final live-readback gate against the applied catalog generation", "final collection readback mismatch", "Repair final governed collection sources before strict audit"],
  ];

  for (const [failedLabel, error, startLabel] of cases) {
    const failedStep = labels.indexOf(failedLabel) + 1;
    const route = getReleaseRepairRoute(
      steps,
      { status: "failed", stepIndex: failedStep, stepLabel: failedLabel, error },
      failedStep,
    );
    assert.ok(route, `expected a route for ${failedLabel}`);
    assert.equal(route.failedStep, failedStep);
    assert.equal(route.fromStep, labels.indexOf(startLabel) + 1);
    assert.equal(route.fromStep < route.failedStep, true);
  }
});

test("step fingerprints are stable and host concurrency remains bounded", () => {
  const step = { label: "sample", command: "node", args: ["sample.mjs"], cwd: "/tmp" };
  assert.equal(releaseStepFingerprint(step, "catalog"), releaseStepFingerprint(step, "catalog"));
  assert.equal(releaseStepFingerprint(step, "catalog"), releaseStepFingerprint(step, "daily"));
  assert.notEqual(releaseStepFingerprint(step, "catalog"), releaseStepFingerprint(step, "products"));
  const workers = recommendedConcurrency({ kind: "io", max: 8 });
  assert.equal(Number.isInteger(workers) && workers >= 1 && workers <= 8, true);
});

test("restarts instead of reusing a changed completed release gate", () => {
  const steps = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "daily" });
  const fingerprint = releaseStepFingerprint(steps[0], "daily");
  assert.equal(findReleaseGraphDrift(steps, [{ index: 1, fingerprint }], "daily"), null);
  assert.deepEqual(
    findReleaseGraphDrift(steps, [{ index: 1, label: steps[0].label, fingerprint: "stale" }], "daily"),
    { index: 1, label: steps[0].label },
  );
});

test("final source readback includes only approved merged semantic aliases", () => {
  const giftsPolicy = SEMANTIC_COLLECTION_POLICIES.find((policy) => policy.handle === "gifts");
  const expected = new Map([["gifts", new Set(["1"])] ]);
  addApprovedSemanticAliasMemberships(expected, [
    { id: "gid://shopify/Product/2", tags: ["gifts"] },
    { id: "gid://shopify/Product/3", tags: ["holiday-gifts"] },
    { id: "gid://shopify/Product/4", tags: ["gifts-for-mom"] },
  ], [giftsPolicy]);

  assert.deepEqual([...expected.get("gifts")].sort(), ["1", "2", "3"]);
});
