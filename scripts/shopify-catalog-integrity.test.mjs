import assert from "node:assert/strict";
import test from "node:test";

import {
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  buildSemanticCollectionSource,
  semanticCollectionRuleTags,
} from "../src/lib/catalog-collection-governance.js";
import {
  collectionSourceMatches,
  canUseVisualTaxonomyEvidence,
  chooseMembershipRetryStrategy,
  isRetryableTagBulkMessage,
  resolveDeterministicKnowledge,
  visualEvidenceMatchesProduct,
} from "./shopify-catalog-integrity.mjs";

function liveSource(source) {
  return {
    __typename: "CollectionConditionsSource",
    targetType: source.targetType,
    inclusion: {
      matchType: source.inclusion.matchType,
      conditions: source.inclusion.conditions.map((condition) => {
        if (condition.productTag) {
          return {
            __typename: "CollectionSourceInclusionConditionProductTag",
            ...condition.productTag,
          };
        }
        return {
          __typename: "CollectionSourceInclusionConditionVariantPrice",
          ...condition.variantPrice,
        };
      }),
    },
  };
}

test("live semantic source matching rejects extra or non-tag conditions", () => {
  const policy = SEMANTIC_COLLECTION_POLICIES.find((candidate) => semanticCollectionRuleTags(candidate).length > 1)
    || SEMANTIC_COLLECTION_POLICIES[0];
  const source = liveSource(buildSemanticCollectionSource(policy));
  assert.equal(collectionSourceMatches(policy, { sources: [source] }), true);

  const extraCondition = {
    __typename: "CollectionSourceInclusionConditionProductTag",
    relation: "TAGGED_WITH",
    matchType: "ANY",
    values: ["unmanaged-extra"],
  };
  source.inclusion.conditions.push(extraCondition);
  assert.equal(collectionSourceMatches(policy, { sources: [source] }), false);
});

test("live price source matching rejects wrong currency and extra conditions", () => {
  const policy = PRICE_COLLECTION_POLICIES.find((candidate) => candidate.handle === "under-35");
  const source = liveSource(buildPriceCollectionSource(policy));
  assert.equal(collectionSourceMatches(policy, { sources: [source] }), true);

  source.inclusion.conditions[0].value.currencyCode = "EUR";
  assert.equal(collectionSourceMatches(policy, { sources: [source] }), false);

  const restored = liveSource(buildPriceCollectionSource(policy));
  restored.inclusion.conditions.push({
    __typename: "CollectionSourceInclusionConditionVariantPrice",
    relation: "GREATER_THAN",
    value: { amount: "1", currencyCode: "USD" },
  });
  assert.equal(collectionSourceMatches(policy, { sources: [restored] }), false);
});

test("visual checkpoints are reused only when the current image set is identical", () => {
  const product = {
    handle: "sample-product",
    images: [{ src: "https://cdn.shopify.com/s/files/sample-a.jpg" }, { src: "https://cdn.shopify.com/s/files/sample-b.jpg" }],
  };
  const checkpoint = { imageUrls: [
    "https://cdn.shopify.com/s/files/sample-a.jpg",
    "https://cdn.shopify.com/s/files/sample-b.jpg",
  ] };
  assert.equal(visualEvidenceMatchesProduct(product, checkpoint), true);
  assert.equal(visualEvidenceMatchesProduct(product, { imageUrls: [checkpoint.imageUrls[0]] }), false);
  assert.equal(visualEvidenceMatchesProduct(product, { imageUrls: [checkpoint.imageUrls[0], "https://cdn.shopify.com/s/files/new.jpg"] }), false);
  assert.equal(visualEvidenceMatchesProduct({ ...product, images: [] }, checkpoint), false);
});

test("deterministic releases never promote visual review evidence into semantic writes", () => {
  assert.equal(canUseVisualTaxonomyEvidence({ deterministicOnly: true, supervisedVision: true }), false);
  assert.equal(canUseVisualTaxonomyEvidence({ deterministicOnly: true, supervisedVision: false }), false);
  assert.equal(canUseVisualTaxonomyEvidence({ deterministicOnly: false, supervisedVision: true }), true);
  assert.equal(canUseVisualTaxonomyEvidence({ deterministicOnly: false, supervisedVision: false }), false);
});

test("strong direct product-family wording produces an auditable evidence fallback", () => {
  const resolution = resolveDeterministicKnowledge({
    title: "Portable Projector for Home",
    handle: "portable-projector-for-home",
    product_type: "Electronics",
    images: [],
  });
  assert.equal(resolution?.source, "evidence-fallback");
  assert.equal(resolution?.evidenceFallback, true);
  assert.equal(resolution?.knowledge?.classificationRule, "merchant-electronics-fallback");
  assert.equal(resolution?.knowledge?.reviewRequired, false);
});

test("tag bulk verifier retries transient errors but fails closed on validation errors", () => {
  assert.equal(isRetryableTagBulkMessage("Internal error. Looks like something went wrong on our end."), true);
  assert.equal(isRetryableTagBulkMessage("Too many requests; please try again later."), true);
  assert.equal(isRetryableTagBulkMessage("Tag value is too long"), false);
});

test("adaptive membership retries target local propagation failures", () => {
  assert.equal(
    chooseMembershipRetryStrategy({
      mode: "adaptive",
      failedCollectionIds: ["gid://shopify/Collection/1"],
      failures: ["pet-toys: 2 missing products"],
    }),
    "targeted",
  );
  assert.equal(
    chooseMembershipRetryStrategy({
      mode: "adaptive",
      failedCollectionIds: ["gid://shopify/Collection/1"],
      collectionless: ["gid://shopify/Product/9"],
      failures: ["1 active products are collectionless"],
    }),
    "bulk",
  );
  assert.equal(
    chooseMembershipRetryStrategy({
      mode: "adaptive",
      failedCollectionIds: ["gid://shopify/Collection/1"],
      failures: ["pet-toys: source mismatch"],
    }),
    "bulk",
  );
  assert.equal(chooseMembershipRetryStrategy({ mode: "bulk", failedCollectionIds: ["collection-1"] }), "bulk");
  assert.equal(chooseMembershipRetryStrategy({ mode: "targeted", failures: ["all-products: missing"] }), "targeted");
});
