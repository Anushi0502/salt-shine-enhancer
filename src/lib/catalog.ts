import { stripHtml } from "@/lib/formatters";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

function normalize(input?: unknown): string {
  if (typeof input === "string") {
    return input.trim().toLowerCase();
  }

  if (Array.isArray(input)) {
    return input
      .map((entry) => (entry == null ? "" : String(entry).trim().toLowerCase()))
      .filter(Boolean)
      .join(" ");
  }

  if (input == null) {
    return "";
  }

  return String(input).trim().toLowerCase();
}

function includeToken(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }

  return haystack.includes(needle);
}

export function searchableText(product: ShopifyProduct): string {
  return normalize(
    [
      product.title,
      product.vendor,
      product.product_type,
      product.tags,
      stripHtml(product.body_html),
      product.handle,
    ].join(" "),
  );
}

export function matchesCollection(
  product: ShopifyProduct,
  collectionHandle: string,
  collections: ShopifyCollection[],
): boolean {
  const handle = normalize(collectionHandle);

  if (!handle) {
    return true;
  }

  const collection = collections.find((entry) => normalize(entry.handle) === handle);
  const collectionTitle = normalize(collection?.title).replace(/\s+/g, "-");

  const productSpace = normalize(
    `${product.product_type} ${product.tags} ${product.title} ${product.handle}`,
  );

  return (
    includeToken(productSpace, handle) ||
    includeToken(productSpace, handle.replace(/-/g, " ")) ||
    includeToken(productSpace, collectionTitle) ||
    includeToken(productSpace, normalize(collection?.title))
  );
}

export function filterProducts(
  products: ShopifyProduct[],
  options: {
    query?: string;
    collection?: string;
    productType?: string;
    collections?: ShopifyCollection[];
  },
): ShopifyProduct[] {
  const query = normalize(options.query);
  const type = normalize(options.productType);
  const collectionHandle = normalize(options.collection);
  const collections = options.collections || [];

  return products.filter((product) => {
    if (type && normalize(product.product_type) !== type) {
      return false;
    }

    if (collectionHandle && !matchesCollection(product, collectionHandle, collections)) {
      return false;
    }

    if (query && !searchableText(product).includes(query)) {
      return false;
    }

    return true;
  });
}

export function uniqueProductTypes(products: ShopifyProduct[]): string[] {
  return Array.from(
    new Set(products.map((product) => normalize(product.product_type)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}
