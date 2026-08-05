import { describe, expect, it } from "vitest";

import { buildSeoPipelineStages } from "../../scripts/shopify-seo-pipeline.mjs";

describe("Shopify SEO pipeline", () => {
  it("keeps dry-run mutation-free and scopes every updater to all products", () => {
    const stages = buildSeoPipelineStages({ mode: "dry-run", scope: "all-products" });
    expect(stages.map((stage) => stage.label)).toEqual([
      "Refresh Shopify catalog data",
      "Plan/apply Google variant metafields (all-products)",
      "Reconcile handle-first SEO (all-products)",
      "Map variant images (all-products)",
      "Backfill product merchandising metafields (all-products)",
    ]);
    expect(stages.flatMap((stage) => stage.args)).not.toContain("--apply");
    expect(stages.find((stage) => stage.label.includes("handle-first"))?.args).toContain("--full-catalog");
  });

  it("uses the generated new-product handles for the product metafield stage", () => {
    const stages = buildSeoPipelineStages({ mode: "apply", scope: "new-products" });
    const variantStage = stages.find((stage) => stage.label.includes("Google variant"));
    const productStage = stages.find((stage) => stage.label.includes("product merchandising"));
    const seoStage = stages.find((stage) => stage.label.includes("handle-first"));
    expect(variantStage?.args).toContain("new-products");
    expect(productStage?.args).toContain("--product-handles-file");
    expect(productStage?.args).toContain("output/shopify-seo-scope-handles.json");
    expect(productStage?.args).toContain("--product-only");
    expect(seoStage?.args).toContain("--new-products-only");
    expect(stages.at(-1)?.label).toBe("Verify merchandising metafields");
  });

  it("keeps frozen new-product runs off the full catalog sync", () => {
    const stages = buildSeoPipelineStages({
      mode: "apply",
      scope: "new-products",
      frozenCatalog: "output/new-product-cohort-catalog.json",
      productHandlesFile: "output/new-product-cohort-handles.json",
    });
    expect(stages.map((stage) => stage.label)).toEqual([
      "Ensure Shopify metafield definitions",
      "Plan/apply Google variant metafields (new-products)",
      "Reconcile handle-first SEO (new-products)",
      "Map variant images (new-products)",
      "Backfill product merchandising metafields (new-products)",
    ]);
    expect(stages.flatMap((stage) => stage.args)).not.toContain("sync:data");
    expect(stages.find((stage) => stage.label.includes("Google variant"))?.args).toContain(
      "output/new-product-cohort-handles.json",
    );
    expect(stages.find((stage) => stage.label.includes("product merchandising"))?.args).toContain(
      "output/new-product-cohort-handles.json",
    );
    expect(stages.find((stage) => stage.label.includes("handle-first"))?.args).toContain(
      "output/new-product-cohort-catalog.json",
    );
    expect(stages.find((stage) => stage.label.includes("handle-first"))?.args).toContain(
      "output/new-product-cohort-handles.json",
    );
    expect(stages.find((stage) => stage.label.includes("Map variant images"))?.args).toContain(
      "output/new-product-cohort-catalog.json",
    );
    expect(stages.find((stage) => stage.label.includes("product merchandising"))?.args).toContain("--product-only");
  });
});
