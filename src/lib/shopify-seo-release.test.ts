import { describe, expect, it } from "vitest";
import { buildReleaseSteps } from "../../scripts/release.mjs";
import {
  buildEligibilityScopedReleasePlan,
  buildCatalogRowsFromSnapshot,
  buildDesiredFingerprint,
  buildLiveFingerprint,
  buildShopifySeoReleasePlan,
  compareLiveProductToPlan,
  isHandleContentMismatch,
  mergeCatalogSnapshotWithLiveProducts,
} from "./shopify-seo-release.js";

function makeSnapshot() {
  return {
    products: [
      {
        id: 101,
        handle: "modern-arc-floor-lamp",
        title: "Modern Arc Floor Lamp",
        body_html: "<p><strong>Modern Arc Floor Lamp</strong> for living rooms.</p>",
        product_type: "Lighting",
        tags: ["merchant-tag", "do-not-change"],
        images: [
          {
            id: 501,
            src: "https://cdn.example.com/lamp.jpg?v=1",
            alt: "Modern Arc Floor Lamp",
            variant_ids: [1001],
          },
        ],
        variants: [
          {
            id: 1001,
            title: "Default Title",
            option1: "Default Title",
            sku: "LAMP-1",
            price: "5.99",
            compare_at_price: "9.99",
          },
        ],
      },
    ],
    collections: [{ id: 1, handle: "living-room", title: "Living Room", products_count: 1 }],
    collectionProducts: {
      collections: {
        "living-room": { title: "Living Room", productIds: [101] },
      },
    },
  };
}

async function makePlanAndLive() {
  const plan = await buildShopifySeoReleasePlan(makeSnapshot());
  const productPlan = plan.products[0];
  const desiredVariant = productPlan.desiredVariantUpdates[0];
  const liveProduct = {
    id: "gid://shopify/Product/101",
    handle: productPlan.handle,
    title: productPlan.desiredProductInput.title,
    descriptionHtml: productPlan.desiredProductInput.descriptionHtml,
    productType: productPlan.desiredProductInput.productType,
    tags: ["merchant-tag", "do-not-change", productPlan.desiredQuantityTag],
    seo: {
      title: productPlan.desiredProductInput.seo.title,
      description: productPlan.desiredProductInput.seo.description,
    },
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1001",
          title: "Default Title",
          sku: "LAMP-1",
          price: desiredVariant.price,
          compareAtPrice: desiredVariant.compareAtPrice || null,
          selectedOptions: [{ name: "Title", value: "Default Title" }],
        },
      ],
    },
    media: {
      nodes: [
        {
          __typename: "MediaImage",
          id: "gid://shopify/MediaImage/501",
          alt: productPlan.desiredMediaTargets[0].alt,
          image: { url: "https://cdn.example.com/lamp.jpg?v=99" },
        },
      ],
    },
  };

  return { plan, productPlan, liveProduct };
}

describe("Shopify SEO release reconciliation", () => {
  it("preserves every catalog handle and variant identity", () => {
    const rows = buildCatalogRowsFromSnapshot(makeSnapshot());

    expect(rows).toHaveLength(1);
    expect(rows[0].Handle).toBe("modern-arc-floor-lamp");
    expect(rows[0]["Product ID"]).toBe("101");
    expect(rows[0]["Variant ID"]).toBe("1001");
    expect(rows[0]["Variant SKU"]).toBe("LAMP-1");
    expect(rows[0].Tags).toBe("merchant-tag, do-not-change");
  });

  it("augments a storefront snapshot with live-only Shopify products", () => {
    const merged = mergeCatalogSnapshotWithLiveProducts(makeSnapshot(), [
      {
        id: "gid://shopify/Product/202",
        handle: "draft-live-only-product",
        title: "Draft Live Only Product",
        descriptionHtml: "<p>Live product details.</p>",
        productType: "Accessories",
        tags: ["merchant-tag"],
        status: "DRAFT",
        variants: {
          nodes: [
            {
              id: "gid://shopify/ProductVariant/2202",
              title: "Default Title",
              sku: "DRAFT-1",
              price: "9.99",
              compareAtPrice: null,
              selectedOptions: [{ name: "Title", value: "Default Title" }],
            },
          ],
        },
        media: {
          nodes: [
            {
              __typename: "MediaImage",
              id: "gid://shopify/MediaImage/2502",
              alt: "",
              image: { url: "https://cdn.example.com/draft.jpg" },
            },
          ],
        },
      },
    ]);

    expect(merged.products).toHaveLength(2);
    expect(merged.liveOnlyProducts).toHaveLength(1);
    expect(merged.products[1].handle).toBe("draft-live-only-product");
    expect(merged.products[1].variants[0].id).toBe("2202");
  });

  it("does not append a product type repeatedly to an already generated title", async () => {
    const title = "Suit Set For Daily And Casual Outfit Styling And Wardrobe Use";
    const plan = await buildShopifySeoReleasePlan({
      products: [
        {
          id: 202,
          handle: "10-piece-pots-and-pans-set-for-kitchen-accessories",
          title,
          body_html: `<p><strong>${title}</strong> is presented as a cookware set listing.</p>`,
          product_type: "COOKWARE SET",
          tags: ["KITCHEN"],
          variants: [{ id: 2202, title: "Default Title", sku: "COOK-1", price: "19.99" }],
        },
      ],
      collections: [],
      collectionProducts: {},
    });

    expect(plan.products[0].desiredProductInput.title).toBe("10 Piece Pots And Pans Set");
    expect(plan.products[0].desiredProductInput.title).not.toContain("Suit Set");
    expect(plan.products[0].intelligence.searchPhrases.join(" ")).not.toContain("suit");
    expect(isHandleContentMismatch(plan.products[0])).toBe(true);
  });

  it("makes SEO titles explicit when Shopify would collapse them to the product-title default", async () => {
    const plan = await buildShopifySeoReleasePlan({
      products: [
        {
          id: 203,
          handle: "creative-womens-tote-bag-trend-face",
          title: "Creative Womens Tote Bag Trend Face",
          body_html: "<p>Creative Womens Tote Bag Trend Face bag.</p>",
          product_type: "Bag",
          tags: ["merchant-tag"],
          variants: [{ id: 2303, title: "Default Title", sku: "BAG-1", price: "19.99" }],
        },
      ],
      collections: [],
      collectionProducts: {},
    }, { forceExplicitSeo: true });

    const product = plan.products[0];
    expect(product.desiredProductInput.seo.title).not.toBe(product.desiredProductInput.title);
    expect(product.desiredProductInput.seo.title).toContain("SALT Online");
  });

  it("disambiguates duplicate SEO without inventing product attributes", async () => {
    const duplicate = (id, handle) => ({
      id,
      handle,
      title: "Adjustable Kids Baseball Cap",
      body_html: "<p>Adjustable kids baseball cap.</p>",
      product_type: "Baseball Cap",
      tags: ["merchant-tag"],
      variants: [{ id: id * 10, title: "Default Title", sku: `CAP-${id}`, price: "19.99" }],
    });
    const plan = await buildShopifySeoReleasePlan({
      products: [
        duplicate(401, "adjustable-kids-baseball-cap"),
        duplicate(402, "adjustable-kids-baseball-cap-1"),
      ],
      collections: [],
      collectionProducts: {},
    });
    const seoTitles = plan.products.map((product) => product.desiredProductInput.seo.title);
    const seoDescriptions = plan.products.map((product) => product.desiredProductInput.seo.description);

    expect(new Set(seoTitles)).toHaveLength(2);
    expect(new Set(seoDescriptions)).toHaveLength(2);
    expect(seoTitles.every((value) => /Ref [A-Z0-9]{6}/.test(value))).toBe(true);
    expect(`${seoTitles.join(" ")} ${seoDescriptions.join(" ")}`).not.toMatch(/silk|leather|waterproof/i);
  });

  it("produces zero mutations for an exact handle-aligned product", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(liveProduct, productPlan);

    expect(diff.hasMutations).toBe(false);
    expect(diff.writeCount).toBe(0);
    expect(diff.productInput).toEqual({ id: "gid://shopify/Product/101" });
    expect(diff.variantInputs).toEqual([]);
    expect(diff.mediaInputs).toEqual([]);
    expect(JSON.stringify(diff.productInput)).not.toContain("tags");
  });

  it("keeps Shopify variant prices unchanged while deriving quantity tags", async () => {
    const { productPlan } = await makePlanAndLive();

    expect(Number(productPlan.currentVariantUpdates[0].price)).toBe(5.99);
    expect(Number(productPlan.desiredVariantUpdates[0].price)).toBe(5.99);
    expect(productPlan.currentQuantityTag).toBe("minimum-qty-3");
    expect(productPlan.desiredQuantityTag).toBe("minimum-qty-3");
  });

  it("adds the managed quantity tag without changing merchant tags", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, tags: ["merchant-tag", "do-not-change"] },
      productPlan,
    );

    expect(productPlan.desiredQuantityTag).toBe("minimum-qty-3");
    expect(diff.productInput.tags).toEqual(["merchant-tag", "do-not-change", "minimum-qty-3"]);
    expect(diff.changedFields).toEqual(["managed-minimum-quantity-tag"]);
  });

  it("replaces a stale managed quantity tag and preserves merchant tags", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, tags: ["merchant-tag", "minimum-qty-2", "do-not-change"] },
      productPlan,
    );

    expect(diff.productInput.tags).toEqual(["merchant-tag", "do-not-change", "minimum-qty-3"]);
    expect(diff.productInput.tags).not.toContain("minimum-qty-2");
  });

  it("writes all missing explicit SEO fields", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan({ ...liveProduct, seo: { title: "", description: "" } }, productPlan);

    expect(diff.productInput).toEqual({
      id: "gid://shopify/Product/101",
      seo: {
        title: productPlan.desiredProductInput.seo.title,
        description: productPlan.desiredProductInput.seo.description,
      },
    });
    expect(diff.changedFields).toEqual(["seo-title", "seo-description"]);
    expect(diff.variantInputs).toHaveLength(0);
    expect(diff.mediaInputs).toHaveLength(0);
  });

  it("writes a null SEO title when the explicit optimized title differs from the product title", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, seo: { title: null, description: liveProduct.seo.description } },
      productPlan,
    );

    expect(diff.changedFields).toContain("seo-title");
    expect(diff.productInput).toEqual({
      id: "gid://shopify/Product/101",
      seo: {
        title: productPlan.desiredProductInput.seo.title,
        description: productPlan.desiredProductInput.seo.description,
      },
    });
  });

  it("writes an explicit SEO title when a title rewrite would otherwise change the null default", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const rewrittenPlan = {
      ...productPlan,
      desiredProductInput: {
        ...productPlan.desiredProductInput,
        title: "Canonical Product Title",
        seo: {
          ...productPlan.desiredProductInput.seo,
          title: "Canonical Product",
        },
      },
    };
    const diff = compareLiveProductToPlan(
      {
        ...liveProduct,
        title: "Stale Product Title",
        seo: { title: null, description: rewrittenPlan.desiredProductInput.seo.description },
      },
      rewrittenPlan,
    );

    expect(diff.productInput.title).toBe("Canonical Product Title");
    expect(diff.productInput.seo).toEqual({
      title: "Canonical Product",
      description: rewrittenPlan.desiredProductInput.seo.description,
    });
    expect(diff.changedFields).toEqual(["title", "seo-title"]);
  });

  it("repairs external SEO drift without touching correct fields or tags", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, seo: { ...liveProduct.seo, title: "Externally changed SEO title" } },
      productPlan,
    );

    expect(diff.productInput.seo).toEqual({
      title: productPlan.desiredProductInput.seo.title,
      description: productPlan.desiredProductInput.seo.description,
    });
    expect(diff.productInput).not.toHaveProperty("tags");
    expect(diff.changedFields).toEqual(["seo-title"]);
    expect(diff.variantInputs).toHaveLength(0);
    expect(diff.mediaInputs).toHaveLength(0);
  });

  it("preserves an explicit SEO sibling when changing only the other SEO field", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const liveWithTitleDrift = {
      ...liveProduct,
      seo: { title: "Externally changed SEO title", description: productPlan.desiredProductInput.seo.description },
    };
    const diff = compareLiveProductToPlan(liveWithTitleDrift, productPlan);

    expect(diff.changedFields).toEqual(["seo-title"]);
    expect(diff.productInput.seo).toEqual({
      title: productPlan.desiredProductInput.seo.title,
      description: productPlan.desiredProductInput.seo.description,
    });
  });

  it("does not mutate price-only drift during SEO", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, variants: { nodes: [{ ...liveProduct.variants.nodes[0], price: "12.99" }] } },
      productPlan,
    );

    expect(diff.productInput).toEqual({ id: "gid://shopify/Product/101" });
    expect(diff.variantInputs).toEqual([]);
    expect(diff.changedFields).toEqual([]);
    expect(diff.skippedFields).toContainEqual(
      expect.objectContaining({ field: "variant-pricing", reason: expect.stringContaining("Shopify-authoritative") }),
    );
  });

  it("detects image alt drift independently", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, media: { nodes: [{ ...liveProduct.media.nodes[0], alt: "Wrong alt" }] } },
      productPlan,
    );

    expect(diff.productInput).toEqual({ id: "gid://shopify/Product/101" });
    expect(diff.variantInputs).toHaveLength(0);
    expect(diff.mediaInputs).toEqual([
      { id: "gid://shopify/MediaImage/501", alt: productPlan.desiredMediaTargets[0].alt },
    ]);
  });

  it("does not require variant identity resolution because SEO cannot mutate variants", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      {
        ...liveProduct,
        variants: {
          nodes: [
            {
              ...liveProduct.variants.nodes[0],
              id: "gid://shopify/ProductVariant/999",
              sku: "OTHER",
              title: "Other",
              selectedOptions: [{ name: "Title", value: "Other" }],
            },
          ],
        },
      },
      productPlan,
    );

    expect(diff.unresolved).toEqual([]);
    expect(diff.variantInputs).toEqual([]);
  });

  it("keeps each quality-tier price and compare-at price distinct", async () => {
    const plan = await buildShopifySeoReleasePlan({
      products: [
        {
          id: 303,
          handle: "quality-tier-hoodie",
          title: "Everyday Hoodie",
          body_html: "<p>Comfortable hoodie with quality choices.</p>",
          product_type: "Hoodies",
          tags: ["merchant-tag"],
          variants: [
            { id: 3301, title: "Standard Quality", option1: "Standard Quality", sku: "HD-STD", price: "29.99", compare_at_price: "39.99" },
            { id: 3302, title: "Premium Quality", option1: "Premium Quality", sku: "HD-PRM", price: "44.99", compare_at_price: "59.99" },
            { id: 3303, title: "Luxury Quality", option1: "Luxury Quality", sku: "HD-LUX", price: "69.99", compare_at_price: "89.99" },
          ],
        },
      ],
      collections: [],
      collectionProducts: {},
    });
    const productPlan = plan.products[0];

    expect(productPlan.desiredVariantUpdates.map((variant) => [variant.label, variant.price, variant.compareAtPrice])).toEqual([
      ["Standard Quality", "29.99", "39.99"],
      ["Premium Quality", "44.99", "59.99"],
      ["Luxury Quality", "69.99", "89.99"],
    ]);

    const diff = compareLiveProductToPlan(
      {
        id: "gid://shopify/Product/303",
        handle: "quality-tier-hoodie",
        tags: ["merchant-tag", productPlan.desiredQuantityTag],
        variants: {
          nodes: productPlan.desiredVariantUpdates.map((variant, index) => ({
            id: `gid://shopify/ProductVariant/${3301 + index}`,
            title: variant.label,
            sku: variant.sku,
            price: "99.99",
            compareAtPrice: "129.99",
            selectedOptions: [{ name: "Quality", value: variant.label }],
          })),
        },
      },
      { ...productPlan, desiredProductInput: {}, desiredMediaTargets: [] },
    );

    expect(diff.variantInputs).toEqual([]);
    expect(diff.changedFields.some((field) => field.includes("variant:"))).toBe(false);
  });

  it("creates variant price inputs only when explicit repair mode is enabled", async () => {
    const snapshot = {
      products: [{
        id: 304,
        handle: "rosemary-pack",
        title: "Rosemary Shampoo",
        body_html: "<p>Rosemary shampoo.</p>",
        product_type: "Shampoo",
        tags: ["merchant-tag"],
        variants: [
          { id: 3401, title: "1pcs", option1: "1pcs", sku: "R-1", price: "49.99", compare_at_price: "64.99" },
          { id: 3402, title: "2pcs", option1: "2pcs", sku: "R-2", price: "49.99", compare_at_price: "64.99" },
        ],
      }],
      collections: [],
      collectionProducts: {},
    };
    const plan = await buildShopifySeoReleasePlan(snapshot, { repairVariantPricing: true });
    const productPlan = plan.products[0];
    const diff = compareLiveProductToPlan({
      id: "gid://shopify/Product/304",
      handle: "rosemary-pack",
      title: "Rosemary Shampoo",
      descriptionHtml: "<p>Rosemary shampoo.</p>",
      productType: "Shampoo",
      tags: ["merchant-tag"],
      seo: { title: productPlan.desiredProductInput.seo.title, description: productPlan.desiredProductInput.seo.description },
      variants: { nodes: [
        { id: "gid://shopify/ProductVariant/3401", title: "1pcs", sku: "R-1", price: "49.99", compareAtPrice: "64.99" },
        { id: "gid://shopify/ProductVariant/3402", title: "2pcs", sku: "R-2", price: "49.99", compareAtPrice: "64.99" },
      ] },
      media: { nodes: [] },
    }, productPlan);

    expect(productPlan.desiredVariantPriceUpdates).toEqual([
      expect.objectContaining({ variantId: "3402", price: "99.99" }),
    ]);
    expect(diff.variantInputs).toEqual([
      { id: "gid://shopify/ProductVariant/3402", price: "99.99", compareAtPrice: "129.99" },
    ]);
  });

  it("keeps desired and live fingerprints stable", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();

    expect(buildDesiredFingerprint(productPlan)).toBe(buildDesiredFingerprint(productPlan));
    expect(buildLiveFingerprint(liveProduct)).toBe(buildLiveFingerprint(liveProduct));
  });

  it("runs the full SEO pass for every product during the initial catalog pass", async () => {
    const { productPlan } = await makePlanAndLive();
    const scoped = buildEligibilityScopedReleasePlan(productPlan, {
      status: "ACTIVE",
      publishedSalesChannels: 2,
      initialFullCatalogPass: true,
    });

    expect(scoped.eligibility.fullSeoEligible).toBe(true);
    expect(scoped.eligibility.reason).toBe("initial full catalog SEO pass");
    expect(scoped.desiredProductInput.title).toBe(productPlan.desiredProductInput.title);
    expect(scoped.desiredVariantUpdates).toHaveLength(1);
    expect(scoped.desiredMediaTargets).toHaveLength(1);
  });

  it("preserves stable published products after the initial pass", async () => {
    const { productPlan } = await makePlanAndLive();
    const scoped = buildEligibilityScopedReleasePlan(productPlan, {
      status: "ACTIVE",
      publishedSalesChannels: 2,
      initialFullCatalogPass: false,
      isNewProduct: false,
      handleMismatch: false,
    });

    expect(scoped.eligibility.fullSeoEligible).toBe(false);
    expect(scoped.eligibility.reason).toBe("existing eligible content preserved");
    expect(scoped.desiredProductInput).toEqual({});
    expect(scoped.desiredVariantUpdates).toEqual([]);
    expect(scoped.desiredMediaTargets).toEqual([]);
  });

  it("keeps the full SEO prompt available for new or draft products later", async () => {
    const { productPlan } = await makePlanAndLive();
    const newProduct = buildEligibilityScopedReleasePlan(productPlan, {
      status: "ACTIVE",
      publishedSalesChannels: 2,
      initialFullCatalogPass: false,
      isNewProduct: true,
    });
    const draftProduct = buildEligibilityScopedReleasePlan(productPlan, {
      status: "DRAFT",
      publishedSalesChannels: 2,
      initialFullCatalogPass: false,
    });

    expect(newProduct.eligibility.fullSeoEligible).toBe(true);
    expect(newProduct.eligibility.reason).toBe("new product handle");
    expect(draftProduct.eligibility.fullSeoEligible).toBe(true);
    expect(draftProduct.eligibility.reason).toBe("draft product");
  });

  it("keeps SEO release before merchandising and build stages", () => {
    const labels = buildReleaseSteps({ rootDir: "/tmp/salt-shine-enhancer" }).map((step) => step.label);
    const merchandisingBackfillLabel = "Apply Shopify merchandising metafield backfill after catalog boundary changes";

    expect(labels.indexOf("Refresh Shopify data")).toBeLessThan(labels.indexOf("Reconcile and verify Shopify SEO/product fields"));
    expect(labels.indexOf("Refresh Shopify data")).toBeLessThan(
      labels.indexOf("Read live Shopify tag inventory"),
    );
    expect(labels.indexOf("Read live Shopify tag inventory")).toBeLessThan(
      labels.indexOf("Regenerate catalog taxonomy and preserved-tag audit"),
    );
    expect(labels.indexOf("Regenerate catalog taxonomy and preserved-tag audit")).toBeLessThan(
      labels.indexOf("Validate refreshed catalog taxonomy"),
    );
    expect(labels.indexOf("Validate refreshed catalog taxonomy")).toBeLessThan(
      labels.indexOf("Require image-backed taxonomy evidence"),
    );
    expect(labels.indexOf("Require image-backed taxonomy evidence")).toBeLessThan(
      labels.indexOf("Ensure Shopify product metafield definitions"),
    );
    expect(labels.indexOf("Reconcile and verify Shopify SEO/product fields")).toBeLessThan(
      labels.indexOf(merchandisingBackfillLabel),
    );
    expect(labels.indexOf("Delete verified active zero-image products")).toBeLessThan(
      labels.indexOf(merchandisingBackfillLabel),
    );
    expect(labels.indexOf(merchandisingBackfillLabel)).toBeLessThan(
      labels.indexOf("Verify Shopify merchandising backfill"),
    );
    expect(labels.indexOf("Delete verified active zero-image products")).toBeLessThan(
      labels.indexOf("Publish every active product to all sales channels"),
    );
    const finalPublicationRefreshIndex = labels.findIndex((label) =>
      label.startsWith("Refresh Shopify data after final product publication:"),
    );
    expect(labels.indexOf("Publish every active product to all sales channels")).toBeLessThan(
      finalPublicationRefreshIndex,
    );
    expect(finalPublicationRefreshIndex).toBeLessThan(
      labels.indexOf("Build web app"),
    );
    expect(labels.indexOf("Apply Shopify merchandising metafield backfill after catalog boundary changes")).toBeLessThan(
      labels.indexOf("Verify every active product has product-specific SEO and metafields"),
    );
    expect(labels.indexOf("Verify every active product has product-specific SEO and metafields")).toBeLessThan(
      labels.indexOf("Verify exact collection membership and price rules"),
    );
    expect(labels.indexOf(merchandisingBackfillLabel)).toBeLessThan(labels.indexOf("Build web app"));
    expect(labels.at(-1)).toBe("Sync Android Capacitor shell");
  });

  it("uses the complete catalog workflow for the daily background release", () => {
    const labels = buildReleaseSteps({
      rootDir: "/tmp/salt-shine-enhancer",
      profile: "daily",
      includeMobile: false,
    }).map((step) => step.label);

    expect(labels).toContain("Verify trained 128M-record catalog knowledge model");
    expect(labels).toContain("Dry-run exact full-catalog collection reconciliation");
    expect(labels).toContain("Apply exact full-catalog collection reconciliation");
    expect(labels).toContain("Verify every active product has product-specific SEO and metafields");
    expect(labels).toContain("Verify exact collection membership and price rules");
    expect(labels).not.toContain("Rework low Shopify prices with the approved campaign cost");
    expect(labels.at(-1)).toBe("Final live-readback gate against the applied catalog generation");
  });

  it("keeps the product release on the new-products SEO and publication path", () => {
    const labels = buildReleaseSteps({ rootDir: "/tmp/salt-shine-enhancer", profile: "products" }).map(
      (step) => step.label,
    );

    expect(labels).toEqual([
      "Run frozen new-product SEO, metafield, and mapping pipeline",
      "Delete verified zero-image products in the new cohort",
      "Publish new-cohort products to all sales channels",
      "Build web app",
      "Generate Shopify theme bundle",
      "Sync iOS Capacitor shell",
      "Sync Android Capacitor shell",
    ]);

    const steps = buildReleaseSteps({ rootDir: "/tmp/salt-shine-enhancer", profile: "products" });
    expect(steps[0].args).toContain("--frozen-catalog");
    expect(steps[0].args).toContain("output/new-product-cohort-catalog.json");
    expect(steps[1].args).toContain("--product-handles-file");
    expect(steps[2].args).toContain("output/new-product-cohort-handles.json");
  });
});
