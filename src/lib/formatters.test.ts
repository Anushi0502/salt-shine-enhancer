import { describe, expect, it } from "vitest";
import { responsiveShopifyImageSrcSet, responsiveShopifyImageUrl } from "@/lib/formatters";

describe("responsive Shopify image URLs", () => {
  it("builds responsive sources for Shopify images served through the custom storefront domain", () => {
    const source = "https://www.saltonlinestore.com/cdn/shop/files/product.webp?v=123&width=900";

    expect(responsiveShopifyImageUrl(source, 480)).toBe(
      "https://www.saltonlinestore.com/cdn/shop/files/product.webp?v=123&width=480",
    );
    expect(responsiveShopifyImageSrcSet(source)).toBe(
      [
        "https://www.saltonlinestore.com/cdn/shop/files/product.webp?v=123&width=320 320w",
        "https://www.saltonlinestore.com/cdn/shop/files/product.webp?v=123&width=480 480w",
        "https://www.saltonlinestore.com/cdn/shop/files/product.webp?v=123&width=720 720w",
      ].join(", "),
    );
  });

  it("does not rewrite images that are not served by Shopify", () => {
    const source = "https://images.example.com/product.webp";

    expect(responsiveShopifyImageUrl(source, 480)).toBe(source);
    expect(responsiveShopifyImageSrcSet(source)).toBeUndefined();
  });
});
