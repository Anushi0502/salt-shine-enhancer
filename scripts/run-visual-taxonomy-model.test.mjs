import { describe, expect, it } from "vitest";

import { reusableEvidence, reusableProductEvidence, selectInferenceProducts } from "./run-visual-taxonomy-model.mjs";
import { catalogVisualFingerprint, catalogVisualProductFingerprint } from "../src/lib/catalog-fingerprint.js";

describe("visual taxonomy inference cache", () => {
  it("reuses evidence only when the model and product images are unchanged", () => {
    const products = [
      { id: "gid://shopify/Product/1", handle: "red-hat", images: [{ src: "https://cdn.test/red.jpg" }] },
    ];
    const model = { modelVersion: "model-v1" };
    const fingerprint = catalogVisualFingerprint(products);
    const existing = {
      modelVersion: "model-v1",
      modelSha256: "abc",
      catalogFingerprint: fingerprint,
      catalogProductCount: 1,
      products: { "red-hat": { accepted: true } },
    };

    expect(reusableEvidence(existing, model, "abc", products, fingerprint)).toBe(true);
    expect(reusableEvidence(existing, model, "different", products, fingerprint)).toBe(false);
    const changedProducts = [{ ...products[0], images: [{ src: "https://cdn.test/blue.jpg" }] }];
    expect(reusableEvidence(existing, model, "abc", changedProducts, catalogVisualFingerprint(changedProducts))).toBe(false);
  });

  it("reuses a product checkpoint without requiring a whole-catalog cache hit", () => {
    const product = { id: "gid://shopify/Product/2", handle: "blue-bag", images: [{ src: "https://cdn.test/bag.jpg" }] };
    const model = { modelVersion: "model-v1" };
    const existing = {
      modelVersion: "model-v1",
      modelSha256: "abc",
      products: {
        "blue-bag": {
          accepted: true,
          productVisualFingerprint: catalogVisualProductFingerprint(product),
        },
      },
    };

    expect(reusableProductEvidence(existing, model, "abc", product)).toMatchObject({ accepted: true });
    expect(reusableProductEvidence(existing, model, "abc", { ...product, images: [{ src: "https://cdn.test/hat.jpg" }] })).toBeNull();
  });

  it("uses explicit review signals instead of scanning every product", () => {
    const products = [
      { id: "1", handle: "review-me", tags: ["classification-fallback"], images: [{ src: "https://cdn.test/a.jpg" }] },
      { id: "2", handle: "already-deterministic", tags: ["women-fashion"], images: [{ src: "https://cdn.test/b.jpg" }] },
    ];

    expect(selectInferenceProducts(products, "review-required")).toEqual([products[0]]);
    expect(selectInferenceProducts(products, "review-required", new Set(["already-deterministic"]))).toEqual([products[0], products[1]]);
    expect(selectInferenceProducts(products, "all")).toEqual(products);
  });
});
