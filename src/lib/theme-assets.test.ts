import { beforeEach, describe, expect, it } from "vitest";

import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

type ThemeWindow = Window & {
  SALT_THEME_ASSET_BASE?: string;
  SALT_THEME_ASSETS?: Record<string, string>;
};

describe("normalizeShopifyAssetUrl", () => {
  beforeEach(() => {
    const themeWindow = window as ThemeWindow;
    delete themeWindow.SALT_THEME_ASSET_BASE;
    themeWindow.SALT_THEME_ASSETS = {};
  });

  it("rewrites bundled theme assets through the Shopify asset base", () => {
    const themeWindow = window as ThemeWindow;
    themeWindow.SALT_THEME_ASSET_BASE = "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/";

    expect(normalizeShopifyAssetUrl("/assets/hero-main-cHr_mQvK.jpg")).toBe(
      "https://cdn.shopify.com/s/files/1/0000/0000/t/123/assets/hero-main-cHr_mQvK.jpg",
    );
  });
});
