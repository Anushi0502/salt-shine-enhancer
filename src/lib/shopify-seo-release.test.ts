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
            price: "13.99",
            compare_at_price: "19.99",
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

    expect(plan.products[0].desiredProductInput.title).toContain("Cookware Set");
    expect(plan.products[0].desiredProductInput.title).not.toContain("Suit Set");
    expect(plan.products[0].intelligence.searchPhrases.join(" ")).not.toContain("suit");
    expect(isHandleContentMismatch(plan.products[0])).toBe(true);
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

  it("uses the reviewed pricing plan and derives quantity tags from the final price", async () => {
    const { productPlan } = await makePlanAndLive();

    expect(Number(productPlan.currentVariantUpdates[0].price)).toBe(13.99);
    expect(Number(productPlan.desiredVariantUpdates[0].price)).toBeGreaterThan(13.99);
    expect(productPlan.currentQuantityTag).toBe("minimum-qty-3");
    expect(productPlan.desiredQuantityTag).toBe("minimum-qty-2");
  });

  it("adds the managed quantity tag without changing merchant tags", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, tags: ["merchant-tag", "do-not-change"] },
      productPlan,
    );

    expect(productPlan.desiredQuantityTag).toBe("minimum-qty-2");
    expect(diff.productInput.tags).toEqual(["merchant-tag", "do-not-change", "minimum-qty-2"]);
    expect(diff.changedFields).toEqual(["managed-minimum-quantity-tag"]);
  });

  it("replaces a stale managed quantity tag and preserves merchant tags", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, tags: ["merchant-tag", "minimum-qty-3", "do-not-change"] },
      productPlan,
    );

    expect(diff.productInput.tags).toEqual(["merchant-tag", "do-not-change", "minimum-qty-2"]);
    expect(diff.productInput.tags).not.toContain("minimum-qty-3");
  });

  it("writes only missing SEO fields", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan({ ...liveProduct, seo: { title: "", description: "" } }, productPlan);

    expect(diff.productInput).toEqual({
      id: "gid://shopify/Product/101",
      seo: { description: productPlan.desiredProductInput.seo.description },
    });
    expect(diff.changedFields).toEqual(["seo-description"]);
    expect(diff.variantInputs).toHaveLength(0);
    expect(diff.mediaInputs).toHaveLength(0);
  });

  it("treats a null SEO title as aligned when Shopify uses the product title default", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, seo: { title: null, description: liveProduct.seo.description } },
      productPlan,
    );

    expect(diff.changedFields).not.toContain("seo-title");
    expect(diff.productInput).toEqual({ id: "gid://shopify/Product/101" });
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

  it("detects price-only drift independently from SEO", async () => {
    const { productPlan, liveProduct } = await makePlanAndLive();
    const diff = compareLiveProductToPlan(
      { ...liveProduct, variants: { nodes: [{ ...liveProduct.variants.nodes[0], price: "12.99" }] } },
      productPlan,
    );

    expect(diff.productInput).toEqual({ id: "gid://shopify/Product/101" });
    expect(diff.variantInputs).toEqual([
      { id: "gid://shopify/ProductVariant/1001", price: productPlan.desiredVariantUpdates[0].price },
    ]);
    expect(diff.changedFields).toEqual(["variant:gid://shopify/ProductVariant/1001:price"]);
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

  it("fails identity comparison when a planned variant cannot be resolved", async () => {
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

    expect(diff.unresolved).toEqual([expect.objectContaining({ kind: "variant", reason: "not-found" })]);
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

    expect(labels.indexOf("Refresh Shopify data")).toBeLessThan(labels.indexOf("Reconcile and verify Shopify SEO/product fields"));
    expect(labels.indexOf("Reconcile and verify Shopify SEO/product fields")).toBeLessThan(
      labels.indexOf("Apply Shopify merchandising metafield backfill"),
    );
    expect(labels.indexOf("Apply Shopify merchandising metafield backfill")).toBeLessThan(labels.indexOf("Build web app"));
    expect(labels.at(-1)).toBe("Sync Android Capacitor shell");
  });
});
