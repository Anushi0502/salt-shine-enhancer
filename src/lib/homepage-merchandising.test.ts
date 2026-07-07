import { describe, expect, it } from "vitest";

import { selectBestSellerProducts } from "@/lib/homepage-merchandising";
import type { ShopifyProduct } from "@/types/shopify";

type ProductInput = {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  price?: string;
};

function makeProduct(input: ProductInput): ShopifyProduct {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    vendor: "SALT",
    product_type: input.product_type || "",
    tags: [],
    body_html: "",
    published_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    variants: [
      {
        id: input.id * 10,
        title: "Default Title",
        price: input.price || "19.99",
        compare_at_price: null,
        available: true,
        sku: "",
        requires_shipping: true,
      },
    ],
    images: [],
    image: null,
  };
}

describe("selectBestSellerProducts", () => {
  it("keeps the curated best seller picks ahead of generic bath toys", () => {
    const selected = selectBestSellerProducts(
      [
        makeProduct({
          id: 1,
          title: "Baby Bath Toy for Bath Time Play and Gifting",
          handle: "baby-bath-toy",
          product_type: "Baby Bath Toy",
          price: "12.99",
        }),
        makeProduct({
          id: 2,
          title: "Organizer for Planning, Storage, and Daily Routines",
          handle: "the-living-legacy-planner-2nd-edition",
          product_type: "planner",
          price: "44.99",
        }),
        makeProduct({
          id: 3,
          title: "Candle for Home Decor and Gifting",
          handle: "scented-decorative-candle-aromatherapy-nordic-room-decor",
          product_type: "CANDLES",
          price: "19.99",
        }),
        makeProduct({
          id: 4,
          title: "Green String Lights for Home and Event Decor",
          handle: "green-leaf-string-lights-artificial-ivy-vine-fairy-light-garland-wedding-party-decoration-christmas-home-room-wall-hanging-plant",
          product_type: "Decorative String Lights",
          price: "24.99",
        }),
        makeProduct({
          id: 5,
          title: "Jute Gift Pouches Small for Everyday Lifestyle Use",
          handle: "jute-gift-pouches-small-drawstring-sachet-bags-for-jewelry-gifts",
          product_type: "JUTE BAGS",
          price: "14.99",
        }),
      ],
      4,
    );

    expect(selected.map((product) => product.handle)).toEqual([
      "the-living-legacy-planner-2nd-edition",
      "scented-decorative-candle-aromatherapy-nordic-room-decor",
      "green-leaf-string-lights-artificial-ivy-vine-fairy-light-garland-wedding-party-decoration-christmas-home-room-wall-hanging-plant",
      "jute-gift-pouches-small-drawstring-sachet-bags-for-jewelry-gifts",
    ]);
  });
});
