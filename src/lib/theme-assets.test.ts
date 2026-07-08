import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeShopifyAssetUrl, resolveThemeAsset } from "@/lib/theme-assets";

type ThemeWindow = {
  SALT_THEME_ASSET_BASE?: string;
  SALT_THEME_ASSETS?: Record<string, string>;
};

describe("normalizeShopifyAssetUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      SALT_THEME_ASSET_BASE: undefined,
      SALT_THEME_ASSETS: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites bundled theme assets through the Shopify asset base", () => {
    const themeWindow = globalThis.window as ThemeWindow;
    themeWindow.SALT_THEME_ASSET_BASE = "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/";

    expect(normalizeShopifyAssetUrl("/assets/hero-main-cHr_mQvK.jpg")).toBe(
      "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/hero-main-cHr_mQvK.jpg",
    );
  });

  it("resolves mapped data assets while preserving cache-busting query strings", () => {
    const themeWindow = globalThis.window as ThemeWindow;
    themeWindow.SALT_THEME_ASSET_BASE = "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/";
    themeWindow.SALT_THEME_ASSETS = {
      "/data/products.json": "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/data-products.json",
    };

    expect(resolveThemeAsset("/data/products.json?ts=12345")).toBe(
      "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/data-products.json?ts=12345",
    );
  });
});
