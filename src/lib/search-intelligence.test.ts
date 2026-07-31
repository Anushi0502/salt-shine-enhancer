import { describe, expect, it } from "vitest";

import { buildSearchIntelligence } from "@/lib/search-intelligence";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  productType: string;
  tags?: string[];
  collectionSignal?: string | null;
  searchProductBoosts?: string[];
  price?: string;
}): ShopifyProduct {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    body_html: "<p>Helpful catalog copy.</p>",
    vendor: "SALT",
    product_type: input.productType,
    tags: input.tags || [],
    created_at: "2026-07-01T00:00:00Z",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    variants: [
      {
        id: input.id * 10,
        title: "Default Title",
        price: input.price || "24.00",
        compare_at_price: null,
        available: true,
      },
    ],
    images: [],
    image: null,
    customData: {
      collectionSignal: input.collectionSignal ?? null,
      searchProductBoosts: input.searchProductBoosts || [],
      highlights: [],
      rating: null,
      ratingCount: null,
      relatedProducts: [],
      complementaryProducts: [],
      relatedProductsDisplay: null,
      badgeText: null,
      subtitle: null,
      googleCustomProduct: null,
      shopChannelMinimumQuantity: null,
      diaperType: null,
      metafields: {},
    },
  };
}

function makeCollection(input: { id: number; title: string; handle: string; description?: string }): ShopifyCollection {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    description: input.description || "",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    image: null,
    products_count: 0,
    customData: null,
  };
}

describe("buildSearchIntelligence", () => {
  it("understands a natural-language need and returns explainable catalog matches", () => {
    const products = [
      makeProduct({
        id: 30,
        title: "USB Desk Glow Lamp",
        handle: "usb-desk-glow-lamp",
        productType: "lighting",
        tags: ["lamp", "desk", "led"],
        price: "34.99",
      }),
      makeProduct({
        id: 31,
        title: "Desk Storage Organizer",
        handle: "desk-storage-organizer",
        productType: "home storage",
        tags: ["desk", "organizer"],
        price: "24.99",
      }),
    ];

    const result = buildSearchIntelligence(products, [], "something to brighten my desk");

    expect(result.resultMode).toBe("catalog-intent");
    expect(result.intent?.label).toBe("Lighting for your space");
    expect(result.exactProducts.map((product) => product.handle)).toEqual(["usb-desk-glow-lamp"]);
    expect(result.matchExplanations[0]?.reasons).toContain("Lighting for your space");
    expect(result.refinements.map((refinement) => refinement.label)).toContain("Under $50");
  });

  it("predicts a collection cue from a misspelled query without surfacing unrelated exact matches", () => {
    const products = [
      makeProduct({
        id: 1,
        title: "Decorative Table Vase",
        handle: "decorative-table-vase",
        productType: "Decorative Accent",
        tags: ["home", "accent"],
        collectionSignal: "Home Decor & Lighting",
      }),
      makeProduct({
        id: 2,
        title: "Minimal Ceramic Bowl",
        handle: "minimal-ceramic-bowl",
        productType: "Tableware",
        tags: ["kitchen"],
        collectionSignal: "Kitchen & Storage",
      }),
    ];
    const collections = [
      makeCollection({
        id: 11,
        title: "Home Decor & Lighting",
        handle: "home-decor",
        description: "Decorative accents for warm rooms.",
      }),
      makeCollection({
        id: 12,
        title: "Kitchen & Storage",
        handle: "kitchen-storage",
        description: "Everyday organization for busy homes.",
      }),
    ];

    const result = buildSearchIntelligence(products, collections, "lightng");

    expect(result.exactProducts).toHaveLength(0);
    expect(result.predictedProducts.map((product) => product.handle)).toEqual(["decorative-table-vase"]);
    expect(result.querySuggestions).toEqual([
      { label: "Home Decor & Lighting", query: "Home Decor & Lighting" },
    ]);
    expect(result.categorySuggestions).toEqual([
      { label: "Home Decor & Lighting", to: "/collections/home-decor" },
    ]);
  });

  it("predicts boost-only products without promoting them into exact results", () => {
    const products = [
      makeProduct({
        id: 8,
        title: "Compact Travel Bottle",
        handle: "compact-travel-bottle",
        productType: "Lifestyle",
        tags: ["bottle"],
        searchProductBoosts: ["outdoor", "commute", "day trip"],
      }),
    ];

    const result = buildSearchIntelligence(products, [], "outdoor");

    expect(result.exactProducts).toHaveLength(0);
    expect(result.predictedProducts.map((product) => product.handle)).toEqual(["compact-travel-bottle"]);
  });

  it("keeps exact matches first and does not duplicate them in predictive results", () => {
    const products = [
      makeProduct({
        id: 3,
        title: "Decorative Table Vase",
        handle: "decorative-table-vase",
        productType: "Decorative Accent",
        tags: ["home", "accent"],
        collectionSignal: "Home Decor & Lighting",
        searchProductBoosts: ["statement centerpiece"],
      }),
      makeProduct({
        id: 4,
        title: "Glass Candle Lantern",
        handle: "glass-candle-lantern",
        productType: "Decorative Accent",
        tags: ["home", "lighting"],
        collectionSignal: "Home Decor & Lighting",
      }),
    ];
    const collections = [
      makeCollection({
        id: 13,
        title: "Home Decor & Lighting",
        handle: "home-decor",
      }),
    ];

    const result = buildSearchIntelligence(products, collections, "vase");

    expect(result.exactProducts.map((product) => product.handle)).toEqual(["decorative-table-vase"]);
    expect(result.predictedProducts.map((product) => product.handle)).toEqual(["decorative-table-vase"]);
    expect(new Set(result.predictedProducts.map((product) => product.id)).size).toBe(result.predictedProducts.length);
    expect(result.querySuggestions[0]).toEqual({ label: "Decorative Table Vase", query: "Decorative Table Vase" });
  });

  it("does not predict lightening products for lighting queries", () => {
    const products = [
      makeProduct({
        id: 5,
        title: "USB Jellyfish Lamp",
        handle: "usb-jellyfish-lamp",
        productType: "lighting",
        tags: ["lamp", "lighting"],
        collectionSignal: "Home Decor & Lighting",
      }),
      makeProduct({
        id: 6,
        title: "Skin Lightening Serum",
        handle: "skin-lightening-serum",
        productType: "Beauty",
        tags: ["skincare"],
        collectionSignal: "Beauty & Wellness",
      }),
      makeProduct({
        id: 7,
        title: "Imagic Highlighting Blush Brush",
        handle: "imagic-highlighting-blush-brush",
        productType: "Beauty",
        tags: ["makeup", "highlighting"],
        collectionSignal: "Beauty & Wellness",
      }),
      makeProduct({
        id: 8,
        title: "Essager 20W Charger Fast Charging Type C Lightning Charger Set",
        handle: "essager-20w-charger-fast-charging-type-c-lightning-charger-set",
        productType: "Electronics",
        tags: ["charger", "usb-c"],
        collectionSignal: "Electronics & Accessories",
      }),
      makeProduct({
        id: 9,
        title: "In-ear Light Wireless Headphones Low Latency Earbuds",
        handle: "in-ear-light-wireless-headphones-low-latency-earbuds",
        productType: "Electronics",
        tags: ["wireless", "headphones", "earbuds"],
        collectionSignal: "Electronics & Accessories",
      }),
    ];
    const collections = [
      makeCollection({
        id: 14,
        title: "Home Decor & Lighting",
        handle: "home-decor",
      }),
      makeCollection({
        id: 15,
        title: "Beauty & Wellness",
        handle: "beauty-wellness",
      }),
    ];

    const result = buildSearchIntelligence(products, collections, "lighting");
    const predictedHandles = result.predictedProducts.map((product) => product.handle);

    expect(predictedHandles).toContain("usb-jellyfish-lamp");
    expect(predictedHandles).not.toContain("skin-lightening-serum");
    expect(predictedHandles).not.toContain("imagic-highlighting-blush-brush");
    expect(predictedHandles).not.toContain("essager-20w-charger-fast-charging-type-c-lightning-charger-set");
    expect(predictedHandles).not.toContain("in-ear-light-wireless-headphones-low-latency-earbuds");
  });

  it("requires all meaningful concepts before predicting a product", () => {
    const products = [
      makeProduct({
        id: 20,
        title: "Wireless Bluetooth Earbuds",
        handle: "wireless-bluetooth-earbuds",
        productType: "Audio",
        tags: ["wireless", "earbuds"],
      }),
      makeProduct({
        id: 21,
        title: "Wireless Mechanical Keyboard",
        handle: "wireless-mechanical-keyboard",
        productType: "Computer Accessories",
        tags: ["wireless", "keyboard"],
      }),
    ];

    const result = buildSearchIntelligence(products, [], "wireless mouse");

    expect(result.exactProducts).toHaveLength(0);
    expect(result.predictedProducts).toHaveLength(0);
  });

  it("keeps predictive results inside a requested price range", () => {
    const products = [
      makeProduct({
        id: 22,
        title: "Wireless Travel Headphones",
        handle: "wireless-travel-headphones",
        productType: "Audio",
        tags: ["wireless", "headphones"],
        price: "29.99",
      }),
      makeProduct({
        id: 23,
        title: "Wireless Studio Headphones",
        handle: "wireless-studio-headphones",
        productType: "Audio",
        tags: ["wireless", "headphones"],
        price: "89.99",
      }),
    ];

    const result = buildSearchIntelligence(products, [], "wireless headphones under $50");

    expect(result.exactProducts.map((product) => product.handle)).toEqual(["wireless-travel-headphones"]);
    expect(result.predictedProducts.map((product) => product.handle)).toEqual(["wireless-travel-headphones"]);
  });
});
