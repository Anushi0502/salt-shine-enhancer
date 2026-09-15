import { CATALOG_TAXONOMY_IMAGE_OVERRIDES } from "./catalog-taxonomy-image-overrides.js";

// Product-specific corrections are deliberately source-controlled. An override
// can only select an existing taxonomy rule and must be explicitly approved.
export const CATALOG_TAXONOMY_OVERRIDE_VERSION = "2026-08-01.2";

const MANUAL_CATALOG_TAXONOMY_OVERRIDES = Object.freeze([
  // {
  //   id: "approved-example",
  //   handle: "example-product-handle",
  //   ruleId: "existing-taxonomy-rule-id",
  //   approved: true,
  //   reason: "Reviewed product-level correction.",
  // },
]);

export const CATALOG_TAXONOMY_OVERRIDES = Object.freeze([
  ...MANUAL_CATALOG_TAXONOMY_OVERRIDES,
  ...CATALOG_TAXONOMY_IMAGE_OVERRIDES,
]);

// Classification runs once per product during catalog builds. Keep override
// lookup constant-time so large catalogs do not rescan the full visual-review
// manifest for every product.
const OVERRIDES_BY_PRODUCT_ID = new Map(
  CATALOG_TAXONOMY_OVERRIDES
    .filter((override) => override?.approved && override?.ruleId && override?.productId)
    .map((override) => [String(override.productId).trim(), override]),
);
const OVERRIDES_BY_HANDLE = new Map(
  CATALOG_TAXONOMY_OVERRIDES
    .filter((override) => override?.approved && override?.ruleId && override?.handle)
    .map((override) => [String(override.handle).trim().toLowerCase(), override]),
);

function normalizeHandle(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeId(value) {
  const id = String(value || "").trim();
  return id || "";
}

export function getCatalogTaxonomyOverride(product) {
  const productId = normalizeId(product?.id);
  const handle = normalizeHandle(product?.handle);
  return (productId ? OVERRIDES_BY_PRODUCT_ID.get(productId) : undefined) ||
    (handle ? OVERRIDES_BY_HANDLE.get(handle) : undefined) ||
    null;
}
