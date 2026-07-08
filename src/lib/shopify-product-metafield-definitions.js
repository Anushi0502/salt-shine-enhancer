const PRODUCT_METAFIELD_DEFINITIONS = [
  {
    id: "reviews.rating",
    kind: "standard",
    name: "Product rating",
    namespace: "reviews",
    key: "rating",
    type: "rating",
    ownerType: "PRODUCT",
    standardTemplateId: 6,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "reviews.rating_count",
    kind: "standard",
    name: "Product rating count",
    namespace: "reviews",
    key: "rating_count",
    type: "number_integer",
    ownerType: "PRODUCT",
    standardTemplateId: 7,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "shopify--discovery--product_recommendation.related_products",
    kind: "standard",
    name: "Related products",
    namespace: "shopify--discovery--product_recommendation",
    key: "related_products",
    type: "list.product_reference",
    ownerType: "PRODUCT",
    standardTemplateId: 14,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "shopify--discovery--product_recommendation.related_products_display",
    kind: "standard",
    name: "Related products setting",
    namespace: "shopify--discovery--product_recommendation",
    key: "related_products_display",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
    standardTemplateId: 15,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "shopify--discovery--product_search_boost.queries",
    kind: "standard",
    name: "Search product boosts",
    namespace: "shopify--discovery--product_search_boost",
    key: "queries",
    type: "list.single_line_text_field",
    ownerType: "PRODUCT",
    standardTemplateId: 16,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "shopify--discovery--product_recommendation.complementary_products",
    kind: "standard",
    name: "Complementary products",
    namespace: "shopify--discovery--product_recommendation",
    key: "complementary_products",
    type: "list.product_reference",
    ownerType: "PRODUCT",
    standardTemplateId: 17,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    pin: true,
  },
  {
    id: "shopify.diaper-type",
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
    description: "Distinguishes between incontinence aids, such as pads, pull-ups, or diapers.",
    validations: [
      {
        name: "metaobject_definition_id",
        value: "gid://shopify/MetaobjectDefinition/9632874595",
      },
    ],
  },
  {
    id: "google.custom_product",
    kind: "custom",
    name: "Google: Custom Product",
    namespace: "google",
    key: "custom_product",
    type: "boolean",
    ownerType: "PRODUCT",
    access: {
      storefront: "PUBLIC_READ",
    },
    pin: true,
    description: "Marks products that should be treated as custom products in Google Merchant Center.",
  },
];

function getProductMetafieldDefinitionId(definition) {
  return `${definition.namespace}.${definition.key}`;
}

function getStandardMetafieldTemplateGid(templateId) {
  return `gid://shopify/StandardMetafieldDefinitionTemplate/${templateId}`;
}

function isStandardProductMetafieldDefinition(definition) {
  return definition.kind === "standard";
}

function isCustomProductMetafieldDefinition(definition) {
  return definition.kind === "custom";
}

export {
  PRODUCT_METAFIELD_DEFINITIONS,
  getProductMetafieldDefinitionId,
  getStandardMetafieldTemplateGid,
  isCustomProductMetafieldDefinition,
  isStandardProductMetafieldDefinition,
};
