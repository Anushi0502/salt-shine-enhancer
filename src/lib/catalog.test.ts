import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { filterProducts } from "@/lib/catalog";
import type { ShopifyProduct } from "@/types/shopify";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  tags?: string[];
  body_html?: string;
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
    variants: [],
    images: [],
    image: null,
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
];

const catalogFixture = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "public/data/products.json"), "utf8"),
) as {
  products: ShopifyProduct[];
};

describe("filterProducts search relevance", () => {
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

  it("supports real-catalog exclusion with operators", () => {
    const results = filterProducts(catalogFixture.products, { query: "mat -pet" }).slice(0, 40);
    const hasPetResult = results.some((entry) => /pet/i.test(`${entry.title} ${entry.handle} ${entry.tags}`));

    expect(hasPetResult).toBe(false);
  });
});
