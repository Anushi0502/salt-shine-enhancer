import { describe, expect, it } from "vitest";

import {
  PRODUCT_METAFIELD_DEFINITIONS,
  getProductMetafieldDefinitionId,
  getStandardMetafieldTemplateGid,
} from "@/lib/shopify-product-metafield-definitions.js";

describe("shopify product metafield definitions", () => {
  it("covers the product metafields used by the storefront", () => {
    expect(PRODUCT_METAFIELD_DEFINITIONS.map(getProductMetafieldDefinitionId)).toEqual([
      "reviews.rating",
      "reviews.rating_count",
      "descriptors.subtitle",
      "shopify--discovery--product_recommendation.related_products",
      "shopify--discovery--product_recommendation.related_products_display",
      "shopify--discovery--product_search_boost.queries",
      "shopify--discovery--product_recommendation.complementary_products",
      "shopify.diaper-type",
      "salt-marketing.badge_text",
      "salt-marketing.highlights",
      "salt-marketing.collection_signal",
      "mm-google-shopping.custom_product",
      "salt-marketing.shop_channel_minimum_quantity",
    ]);
  });

  it("uses the Shopify standard definition template ids for discovery fields", () => {
    const standardDefinitions = PRODUCT_METAFIELD_DEFINITIONS.filter(
      (definition) => definition.kind === "standard",
    );

    expect(standardDefinitions).toHaveLength(7);
    expect(
      standardDefinitions.map((definition) => getStandardMetafieldTemplateGid(definition.standardTemplateId)),
    ).toEqual([
      "gid://shopify/StandardMetafieldDefinitionTemplate/6",
      "gid://shopify/StandardMetafieldDefinitionTemplate/7",
      "gid://shopify/StandardMetafieldDefinitionTemplate/1",
      "gid://shopify/StandardMetafieldDefinitionTemplate/14",
      "gid://shopify/StandardMetafieldDefinitionTemplate/15",
      "gid://shopify/StandardMetafieldDefinitionTemplate/16",
      "gid://shopify/StandardMetafieldDefinitionTemplate/17",
    ]);
  });

  it("includes the Diaper type metaobject-backed product metafield definition", () => {
    expect(
      PRODUCT_METAFIELD_DEFINITIONS.find((definition) => definition.id === "shopify.diaper-type"),
    ).toMatchObject({
      kind: "custom",
      name: "Diaper type",
      namespace: "shopify",
      key: "diaper-type",
      type: "list.metaobject_reference",
      ownerType: "PRODUCT",
      access: {
        admin: "PUBLIC_READ_WRITE",
        storefront: "PUBLIC_READ",
      },
      pin: true,
      validations: [
        {
          name: "metaobject_definition_id",
          value: "gid://shopify/MetaobjectDefinition/9632874595",
        },
      ],
    });
  });
});
