import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { filterProducts, parseSearchQuery } from "@/lib/catalog";
import { isProductCatalogManifest, mergeProductShardPayloads } from "@/lib/product-catalog-shards.js";
import type { ShopifyProduct } from "@/types/shopify";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  tags?: string[];
  body_html?: string;
  customData?: ShopifyProduct["customData"];
  price?: string;
  available?: boolean;
}): ShopifyProduct {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    body_html: input.body_html || "",
    vendor: "SALT",
    product_type: input.product_type || "",
    tags: input.tags || [],
    created_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    variants: input.price
      ? [{
          id: input.id * 10,
          title: "Default Title",
          price: input.price,
          compare_at_price: null,
          available: input.available !== false,
        }]
      : [],
    images: [],
    image: null,
    customData: input.customData || null,
  };
}

const products: ShopifyProduct[] = [
  makeProduct({
    id: 1,
    title: "Stainless Steel Garden Hand Shovel",
    handle: "stainless-steel-garden-hand-shovel",
    product_type: "garden tools",
    tags: ["garden", "tools", "shovel"],
  }),
  makeProduct({
    id: 2,
    title: "Silicone Cookware Set - Shovel and Spoon",
    handle: "silicone-cookware-set-shovel-spoon",
    product_type: "kitchen tools",
    tags: ["kitchen", "cookware"],
  }),
  makeProduct({
    id: 3,
    title: "Women's Summer Sleeveless Maxi Dress",
    handle: "womens-summer-sleeveless-maxi-dress",
    product_type: "women wear",
    tags: ["dress", "maxi", "summer"],
  }),
  makeProduct({
    id: 4,
    title: "Elegant Satin Party Dress",
    handle: "elegant-satin-party-dress",
    product_type: "women wear",
    tags: ["dress", "party"],
  }),
  makeProduct({
    id: 5,
    title: "Insulated Sports Water Bottle",
    handle: "insulated-sports-water-bottle",
    product_type: "lifestyle",
    tags: ["bottle", "fitness"],
  }),
  makeProduct({
    id: 6,
    title: "Quick-Dry Kitchen Sink Mat",
    handle: "quick-dry-kitchen-sink-mat",
    product_type: "kitchen tools",
    tags: ["kitchen", "mat"],
  }),
  makeProduct({
    id: 7,
    title: "Men's Classic Stripe T-Shirt",
    handle: "mens-classic-stripe-t-shirt",
    product_type: "tops",
    tags: ["t-shirt", "mens"],
  }),
  makeProduct({
    id: 8,
    title: "Waterproof Pet Feeding Mat",
    handle: "waterproof-pet-feeding-mat",
    product_type: "pet",
    tags: ["pet", "mat"],
  }),
  makeProduct({
    id: 9,
    title: "Compact Travel Bottle",
    handle: "compact-travel-bottle",
    product_type: "lifestyle",
    tags: ["bottle"],
    customData: {
      searchProductBoosts: ["outdoor", "commute", "day trip"],
    },
  }),
];

const catalogManifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "public/data/products.json"), "utf8"),
);
const catalogFixture = isProductCatalogManifest(catalogManifest)
  ? mergeProductShardPayloads(
      catalogManifest,
      catalogManifest.shards.map((shard: { file: string }) =>
        JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data", shard.file), "utf8")),
      ),
    )
  : catalogManifest as { products: ShopifyProduct[] };

describe("filterProducts search relevance", () => {
  it("understands a natural space need instead of requiring every intent word in the title", () => {
    const results = filterProducts(
      [
        makeProduct({
          id: 30,
          title: "USB Desk Glow Lamp",
          handle: "usb-desk-glow-lamp",
          product_type: "lighting",
          tags: ["lamp", "desk", "led"],
        }),
        makeProduct({
          id: 31,
          title: "Desk Storage Organizer",
          handle: "desk-storage-organizer",
          product_type: "home storage",
          tags: ["desk", "organizer"],
        }),
        makeProduct({
          id: 32,
          title: "Skin Lightening Serum",
          handle: "skin-lightening-serum",
          product_type: "beauty",
          tags: ["skincare"],
        }),
      ],
      { query: "something to brighten my desk" },
    );

    expect(parseSearchQuery("something to brighten my desk").intent?.key).toBe("lighting");
    expect(results.map((entry) => entry.handle)).toEqual(["usb-desk-glow-lamp"]);
  });

  it("keeps shovel search scoped to relevant products", () => {
    const results = filterProducts(products, { query: "shovel" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("stainless-steel-garden-hand-shovel");
    expect(handles).toContain("silicone-cookware-set-shovel-spoon");
    expect(handles).not.toContain("womens-summer-sleeveless-maxi-dress");
    expect(handles).not.toContain("elegant-satin-party-dress");
  });

  it("supports typo tolerance without leaking unrelated products", () => {
    const results = filterProducts(products, { query: "shovle" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("stainless-steel-garden-hand-shovel");
    expect(handles).not.toContain("womens-summer-sleeveless-maxi-dress");
    expect(handles).not.toContain("elegant-satin-party-dress");
  });

  it("does not confuse lighting with lightening", () => {
    const results = filterProducts(
      [
        makeProduct({
          id: 10,
          title: "USB Jellyfish Lamp",
          handle: "usb-jellyfish-lamp",
          product_type: "lighting",
          tags: ["lamp", "lighting"],
        }),
        makeProduct({
          id: 11,
          title: "Skin Lightening Serum",
          handle: "skin-lightening-serum",
          product_type: "beauty",
          tags: ["skincare"],
        }),
        makeProduct({
          id: 12,
          title: "Imagic Highlighting Blush Brush",
          handle: "imagic-highlighting-blush-brush",
          product_type: "beauty",
          tags: ["makeup", "highlighting"],
        }),
        makeProduct({
          id: 13,
          title: "Essager 20W Charger Fast Charging Type C Lightning Charger Set",
          handle: "essager-20w-charger-fast-charging-type-c-lightning-charger-set",
          product_type: "electronics",
          tags: ["charger", "usb-c"],
        }),
        makeProduct({
          id: 18,
          title: "In-ear Light Wireless Headphones Low Latency Earbuds",
          handle: "in-ear-light-wireless-headphones-low-latency-earbuds",
          product_type: "electronics",
          tags: ["wireless", "headphones", "earbuds"],
        }),
      ],
      { query: "lighting" },
    );
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("usb-jellyfish-lamp");
    expect(handles).not.toContain("skin-lightening-serum");
    expect(handles).not.toContain("imagic-highlighting-blush-brush");
    expect(handles).not.toContain("essager-20w-charger-fast-charging-type-c-lightning-charger-set");
    expect(handles).not.toContain("in-ear-light-wireless-headphones-low-latency-earbuds");
  });

  it("supports multi-term search across the full query", () => {
    const results = filterProducts(products, { query: "sleeveless maxi dress" });
    const handles = results.map((entry) => entry.handle);

    expect(handles[0]).toBe("womens-summer-sleeveless-maxi-dress");
    expect(handles).not.toContain("stainless-steel-garden-hand-shovel");
  });

  it("keeps short-token search precise (mat should not surface dress)", () => {
    const results = filterProducts(products, { query: "mat" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("quick-dry-kitchen-sink-mat");
    expect(handles).not.toContain("womens-summer-sleeveless-maxi-dress");
    expect(handles).not.toContain("elegant-satin-party-dress");
  });

  it("supports apparel synonym forms (tshirt -> t-shirt)", () => {
    const results = filterProducts(products, { query: "tshirt" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("mens-classic-stripe-t-shirt");
  });

  it("supports exclusion operators for intent refinement", () => {
    const results = filterProducts(products, { query: "mat -pet" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("quick-dry-kitchen-sink-mat");
    expect(handles).not.toContain("waterproof-pet-feeding-mat");
  });

  it("supports quoted phrase intent", () => {
    const results = filterProducts(products, { query: "\"sink mat\"" });
    const handles = results.map((entry) => entry.handle);

    expect(handles[0]).toBe("quick-dry-kitchen-sink-mat");
    expect(handles).not.toContain("womens-summer-sleeveless-maxi-dress");
  });

  it("understands price and availability constraints without treating them as product words", () => {
    const results = filterProducts(
      [
        makeProduct({
          id: 14,
          title: "Wireless Travel Headphones",
          handle: "wireless-travel-headphones",
          product_type: "audio",
          tags: ["wireless", "headphones"],
          price: "29.99",
        }),
        makeProduct({
          id: 15,
          title: "Wireless Studio Headphones",
          handle: "wireless-studio-headphones",
          product_type: "audio",
          tags: ["wireless", "headphones"],
          price: "89.99",
        }),
        makeProduct({
          id: 16,
          title: "Wireless Travel Headphones Case",
          handle: "wireless-travel-headphones-case",
          product_type: "audio accessories",
          tags: ["wireless", "headphones", "case"],
          price: "19.99",
          available: false,
        }),
      ],
      { query: "wireless headphones under $50 in stock" },
    );

    expect(results.map((entry) => entry.handle)).toEqual(["wireless-travel-headphones"]);
  });

  it("matches multi-word synonym phrases", () => {
    const results = filterProducts(
      [
        makeProduct({
          id: 17,
          title: "Protective Mobile Phone Case",
          handle: "protective-mobile-phone-case",
          product_type: "phone accessories",
          tags: ["phone", "case"],
        }),
      ],
      { query: "smartphone cover" },
    );

    expect(results.map((entry) => entry.handle)).toEqual(["protective-mobile-phone-case"]);
  });

  it("prevents cross-category bleed in real catalog search", () => {
    const results = filterProducts(catalogFixture.products, { query: "shovel" }).slice(0, 30);

    const hasDressResult = results.some((entry) => /dress/i.test(`${entry.title} ${entry.handle}`));
    expect(hasDressResult).toBe(false);
  });

  it("keeps real-catalog short search tight for mat", () => {
    const results = filterProducts(catalogFixture.products, { query: "mat" }).slice(0, 40);
    const hasDressResult = results.some((entry) => /dress/i.test(`${entry.title} ${entry.handle}`));

    expect(hasDressResult).toBe(false);
  });

  it("keeps the first 100 lighting results free of beauty and charging false friends", () => {
    const results = filterProducts(catalogFixture.products, { query: "lighting" }).slice(0, 100);
    const falseFriendResult = results.some((entry) =>
      /lightening|highlighting|brightening|whitening|lifting|misting|thermos|serum|moisturiz/i.test(
        `${entry.title} ${entry.handle} ${entry.tags}`,
      ),
    );

    expect(falseFriendResult).toBe(false);
  });

  it("supports real-catalog exclusion with operators", () => {
    const results = filterProducts(catalogFixture.products, { query: "mat -pet" }).slice(0, 40);
    const hasPetResult = results.some((entry) => /\bpet\b/i.test(`${entry.title} ${entry.handle} ${entry.tags}`));

    expect(hasPetResult).toBe(false);
  });

  it("does not surface boost-only products in exact search", () => {
    const results = filterProducts(products, { query: "outdoor" });
    const handles = results.map((entry) => entry.handle);

    expect(handles).toEqual([]);
  });

  it("drops out-of-category products even when a live collection contains them", () => {
    const results = filterProducts(
      [
        makeProduct({
          id: 10,
          title: "Nonstick Fry Pan",
          handle: "nonstick-fry-pan",
          product_type: "kitchen tools",
          tags: ["kitchen", "cookware", "pan"],
        }),
        makeProduct({
          id: 11,
          title: "Classic Cotton Shirt",
          handle: "classic-cotton-shirt",
          product_type: "apparel",
          tags: ["shirt", "cotton"],
        }),
      ],
      {
        collection: "cookware",
        collections: [],
        collectionProductIds: [10, 11],
      },
    );

    const handles = results.map((entry) => entry.handle);

    expect(handles).toContain("nonstick-fry-pan");
    expect(handles).not.toContain("classic-cotton-shirt");
  });
});
