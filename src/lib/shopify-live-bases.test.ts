import { describe, expect, it } from "vitest";
import { buildLiveShopifyBaseCandidates } from "@/lib/shopify-live-bases";

describe("buildLiveShopifyBaseCandidates", () => {
  it("prefers the branded proxy in native apps", () => {
    expect(
      buildLiveShopifyBaseCandidates({
        browserOrigin: "capacitor://localhost",
        shopBaseOrigin: "https://www.saltonlinestore.com",
        shopApiBase: "https://0309d3-72.myshopify.com",
        native: true,
        localHost: true,
      }),
    ).toEqual([
      "https://www.saltonlinestore.com/__salt_shopify",
      "https://0309d3-72.myshopify.com",
    ]);
  });

  it("uses the local proxy first on desktop dev", () => {
    expect(
      buildLiveShopifyBaseCandidates({
        browserOrigin: "http://127.0.0.1:4173",
        shopBaseOrigin: "https://www.saltonlinestore.com",
        shopApiBase: "https://0309d3-72.myshopify.com",
        native: false,
        localHost: true,
      }),
    ).toEqual([
      "http://127.0.0.1:4173/__salt_shopify",
      "https://www.saltonlinestore.com/__salt_shopify",
      "https://0309d3-72.myshopify.com",
      "http://127.0.0.1:4173",
    ]);
  });

  it("uses the current Shopify custom domain first in production", () => {
    expect(
      buildLiveShopifyBaseCandidates({
        browserOrigin: "https://www.saltonlinestore.com",
        shopBaseOrigin: "https://www.saltonlinestore.com",
        shopApiBase: "https://0309d3-72.myshopify.com",
        native: false,
      }),
    ).toEqual([
      "https://www.saltonlinestore.com",
      "https://0309d3-72.myshopify.com",
    ]);
  });
});
