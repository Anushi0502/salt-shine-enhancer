import { describe, expect, it } from "vitest";
import {
  buildSeoBatchExportRows,
  buildSeoBatchManifest,
  buildSeoBatchPlan,
  createSeoCatalogContext,
  PER_ORDER_OVERHEAD,
} from "@/lib/shopify-seo-batch-intelligence";
import {
  enforceMarketplaceTitle,
  PRODUCT_CONTENT_KNOWLEDGE_VERSION,
  resolveProductKnowledge,
} from "@/lib/shopify-product-content-knowledge";

function makeCatalogContext() {
  return createSeoCatalogContext({
    products: [
      {
        id: 101,
        handle: "modern-arc-floor-lamp",
        title: "Modern Arc Floor Lamp",
        body_html: "<p>Catalog copy for a modern arc floor lamp.</p>",
        product_type: "Lighting",
        tags: ["floor lamp", "arc", "living room"],
        variants: [
          {
            id: 1001,
            price: "10.00",
          },
        ],
        customData: {
          subtitle: "Curated floor lamp for living rooms",
          highlights: ["modern", "arc", "floor lamp"],
          searchProductBoosts: ["modern arc lamp", "living room lamp", "floor lamp"],
          rating: 4.8,
          ratingCount: 42,
          collectionSignal: "Living Room",
        },
      },
    ],
    collections: [
      {
        id: 1,
        title: "Living Room",
        handle: "living-room",
        products_count: 1,
      },
      {
        id: 2,
        title: "Modern Lighting",
        handle: "modern-lighting",
        products_count: 1,
      },
    ],
    collectionProducts: {
      collections: {
        "living-room": {
          title: "Living Room",
          productIds: [101],
        },
        "modern-lighting": {
          title: "Modern Lighting",
          productIds: [101],
        },
      },
    },
  });
}

describe("shopify SEO batch intelligence", () => {
  it("resolves handle-first marketplace knowledge without using stale tags", () => {
    expect(resolveProductKnowledge("facial-mist-sprayer-usb-charging").id).toBe("skin-care");
    expect(resolveProductKnowledge("logitech-wireless-bluetooth-mouse").id).toBe("computer-peripheral");
    expect(resolveProductKnowledge("stainless-steel-camping-cook-kit").id).toBe("kitchen-cookware");
    expect(resolveProductKnowledge("shockproof-case-for-iphone-17-pro-max").id).toBe("phone-device-accessory");
    expect(resolveProductKnowledge("waterproof-laptop-sleeve-bag-for-macbook").id).toBe("bag-storage");
    expect(resolveProductKnowledge("automatic-mechanical-watch-for-men").id).toBe("watch");
    expect(resolveProductKnowledge("electric-beard-trimmer-for-men").id).toBe("personal-grooming");
    expect(resolveProductKnowledge("heavy-duty-knee-pads-for-work").id).toBe("tool-protective-gear");
    expect(PRODUCT_CONTENT_KNOWLEDGE_VERSION).toMatch(/^2026-/);
  });

  it("applies marketplace title repetition and character guardrails", () => {
    const title = enforceMarketplaceTitle("Premium! Mouse Mouse Mouse $ Wireless Office Mouse", 68);
    expect(title).not.toMatch(/[!$]/);
    expect(title.toLowerCase().match(/mouse/g)).toHaveLength(2);
    expect(title.length).toBeLessThanOrEqual(68);
  });

  it("removes unsafe supplier claims and repairs family-mismatched titles", async () => {
    const plan = await buildSeoBatchPlan([{
      Handle: "knee-brace-maximum-knee-pain-support-fast-recovery-for-men-women",
      "Product ID": "202",
      Title: "Fresh Signature Scent Perfume for Daily Wear",
      "Body (HTML)": "<p>Maximum pain relief with fast recovery.</p>",
      "Variant SKU": "KNEE-1",
      "Variant Price": "29.99",
      "Option1 Value": "Buy 2 Get 1 Free",
    }]);
    const product = plan.products[0];
    const generated = `${product.intelligence.canonicalTitle} ${product.intelligence.canonicalDescriptionHtml}`;

    expect(product.intelligence.knowledge.family).toBe("tool-protective-gear");
    expect(product.intelligence.canonicalTitle).toMatch(/knee brace/i);
    expect(generated).not.toMatch(/maximum|pain relief|pain support|fast recovery/i);
    expect(product.intelligence.canonicalTitle).not.toMatch(/perfume/i);
    expect(product.intelligence.canonicalDescriptionHtml).not.toMatch(/Buy 2|Get 1 Free/i);
  });

  it("prefers handle and catalog evidence over a stale source title", async () => {
    const catalogContext = makeCatalogContext();
    const planResult = await buildSeoBatchPlan(
      [
        {
          Handle: "modern-arc-floor-lamp",
          "Product ID": "101",
          Title: "Completely Wrong Title",
          "Body (HTML)": "<p>Outdated copy.</p>",
          Type: "Decor",
          Tags: "home decor",
          "SEO Title": "Old SEO",
          "SEO Description": "Old SEO description",
          "Variant SKU": "LAMP-1",
          "Variant Price": "10.00",
          "Variant Compare At Price": "12.00",
        },
      ],
      { catalogContext },
    );

    const [plan] = planResult.products;

    expect(plan).toBeTruthy();
    expect(plan.rewriteLevel).toBe("high");
    expect(plan.confidence).toBeGreaterThanOrEqual(70);
    expect(plan.intelligence.canonicalTitle).toContain("Modern Arc Floor Lamp");
    expect(plan.productInput.title).toContain("Modern Arc Floor Lamp");
    expect(plan.productInput.title).not.toBe("Completely Wrong Title");
    expect(plan.productInput.descriptionHtml).toContain("trusted reviews");
    expect(plan.productInput.descriptionHtml).toContain("Key Details");
    expect(plan.productInput.descriptionHtml).toContain("Use &amp; Care");
    expect(plan.productInput.descriptionHtml).not.toContain("Why Customers Choose It");
    expect(plan.productInput.descriptionHtml).not.toContain("Who Is This For?");
    expect((plan.productInput.descriptionHtml.match(/<h[23]>/g) || [])).toHaveLength(4);
    expect(plan.productInput.seo.title).toContain("Modern Arc Floor Lamp");
    expect(plan.productInput.seo.description).toMatch(/4\.8 stars from 42 trusted reviews/);
    expect(plan.intelligence.reviewSummary).toEqual(
      expect.objectContaining({
        rating: 4.8,
        ratingCount: 42,
        source: "catalog",
      }),
    );
    expect(plan.reasons.join(" ")).toMatch(/catalog-anchor/);
    expect(plan.intelligence.knowledge).toEqual(expect.objectContaining({
      family: "home-lighting",
      version: PRODUCT_CONTENT_KNOWLEDGE_VERSION,
    }));
  });

  it("preserves low-confidence rows without rewriting title or SEO", async () => {
    const planResult = await buildSeoBatchPlan([
      {
        Handle: "item-123",
        Title: "Product",
        "Body (HTML)": "",
        Type: "",
        Tags: "",
        "Variant SKU": "SKU-1",
      },
    ]);

    const [plan] = planResult.products;

    expect(plan.rewriteLevel).toBe("low");
    expect(plan.productInput.title).toBeUndefined();
    expect(plan.productInput.descriptionHtml).toBeUndefined();
    expect(plan.productInput.seo).toBeUndefined();
    expect(plan.variantUpdates).toHaveLength(0);
  });

  it("exports patched rows and lifts variant pricing from the catalog anchor", async () => {
    const catalogContext = makeCatalogContext();
    const rows = [
      {
        Handle: "modern-arc-floor-lamp",
        "Product ID": "101",
        Title: "Completely Wrong Title",
        "Body (HTML)": "<p>Old body.</p>",
        Type: "Decor",
        Tags: "home decor",
        "SEO Title": "Old SEO",
        "SEO Description": "Old SEO description",
        "Variant SKU": "LAMP-1",
        "Variant Price": "10.00",
        "Variant Compare At Price": "12.00",
      },
      {
        Handle: "modern-arc-floor-lamp",
        "Product ID": "101",
        "Variant SKU": "LAMP-2",
        "Variant Price": "10.00",
        "Variant Compare At Price": "12.00",
      },
    ];

    const planResult = await buildSeoBatchPlan(rows, { catalogContext });
    const exportRows = buildSeoBatchExportRows(rows, planResult);

    expect(exportRows[0].Title).not.toBe(rows[0].Title);
    expect(exportRows[0]["SEO Title"]).toContain("Modern Arc Floor Lamp");
    expect(exportRows[0]["SEO Description"]).toMatch(/trusted reviews/);
    expect(exportRows[1]["Variant Price"]).toBe("13.99");
    expect(exportRows[1]["Variant Compare At Price"]).toBe("14.00");
    expect(planResult.products[0].productInput).not.toHaveProperty("tags");
    expect(exportRows[0].Tags).toBe("home decor, minimum-qty-3");
    expect(exportRows[1]).not.toHaveProperty("Tags");
    expect(rows[0].Title).toBe("Completely Wrong Title");
    expect(Object.keys(exportRows[0])).toEqual(Object.keys(rows[0]));
  });

  it("keeps supplier-cost pricing above the per-order overhead floor", async () => {
    const rows = [{
      Handle: "modern-arc-floor-lamp",
      "Product ID": "101",
      Title: "Modern Arc Floor Lamp",
      "Variant SKU": "LAMP-COST",
      "Variant Price": "10.00",
      "Cost per item": "10.00",
    }];
    const plan = await buildSeoBatchPlan(rows, { catalogContext: makeCatalogContext() });
    const [exported] = buildSeoBatchExportRows(rows, plan);
    expect(Number(exported["Variant Price"])).toBeGreaterThanOrEqual(10 + PER_ORDER_OVERHEAD);
    expect(PER_ORDER_OVERHEAD).toBe(12);
  });

  it("builds a manifest with reasons, skipped fields, and write counts", async () => {
    const catalogContext = makeCatalogContext();
    const planResult = await buildSeoBatchPlan(
      [
        {
          Handle: "modern-arc-floor-lamp",
          "Product ID": "101",
          Title: "Completely Wrong Title",
          "Body (HTML)": "<p>Outdated copy.</p>",
          Type: "Decor",
          Tags: "home decor",
          "SEO Title": "Old SEO",
          "SEO Description": "Old SEO description",
          "Variant SKU": "LAMP-1",
          "Variant Price": "10.00",
          "Variant Compare At Price": "12.00",
        },
      ],
      { catalogContext },
    );

    const manifest = buildSeoBatchManifest(planResult, {
      inputPath: "/tmp/input.csv",
      mode: "export",
    });

    expect(manifest.mode).toBe("export");
    expect(manifest.summary.handleGroups).toBe(1);
    expect(manifest.products[0].writeCount).toBeGreaterThan(0);
    expect(manifest.products[0].reasons.join(" ")).toMatch(/reviews:4.8\/42/);
    expect(Array.isArray(manifest.products[0].skippedFields)).toBe(true);
    expect(manifest.products[0].reviewSummary).toEqual(
      expect.objectContaining({
        rating: 4.8,
        ratingCount: 42,
        source: "catalog",
      }),
    );
    expect(manifest.knowledgeBank.version).toBe(PRODUCT_CONTENT_KNOWLEDGE_VERSION);
    expect(manifest.products[0].knowledge.family).toBe("home-lighting");
    expect(manifest.products[0].desiredQuantityTag).toBe("minimum-qty-3");
  });
});
