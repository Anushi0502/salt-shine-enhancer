import { describe, expect, it } from "vitest";

import {
  COLLECTION_MARKETING_METAFIELD_DEFINITIONS,
  SHOP_MARKETING_METAFIELD_DEFINITIONS,
  getMarketingMetafieldDefinitionId,
} from "@/lib/shopify-marketing-metafield-definitions.js";

describe("shopify marketing metafield definitions", () => {
  it("covers the collection merchandising metafields", () => {
    expect(COLLECTION_MARKETING_METAFIELD_DEFINITIONS.map(getMarketingMetafieldDefinitionId)).toEqual([
      "salt-marketing.hero_kicker",
      "salt-marketing.hero_summary",
      "salt-marketing.featured_products",
      "salt-marketing.trust_strip",
    ]);
  });

  it("covers the shop merchandising metafields", () => {
    expect(SHOP_MARKETING_METAFIELD_DEFINITIONS.map(getMarketingMetafieldDefinitionId)).toEqual([
      "salt-marketing.banner_text",
      "salt-marketing.trust_strip",
    ]);
  });
});
