import type { ShopifyShop } from "@/types/shopify";

type StructuredData = Record<string, unknown>;

export function buildOrganizationStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: shop?.name || "SALT",
    url: origin,
  };
}

export function buildWebsiteStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: shop?.name || "SALT",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
