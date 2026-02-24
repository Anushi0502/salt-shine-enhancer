import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
});

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

export function stripHtml(input: unknown): string {
  const text = asText(input);

  return text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asNumber(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortVariantsByPrice(variants: ShopifyVariant[]): ShopifyVariant[] {
  return [...variants].sort((a, b) => asNumber(a.price) - asNumber(b.price));
}

export function minPrice(product: ShopifyProduct): number {
  const sorted = sortVariantsByPrice(product.variants);
  return sorted.length ? asNumber(sorted[0].price) : 0;
}

export function maxPrice(product: ShopifyProduct): number {
  const sorted = sortVariantsByPrice(product.variants);
  return sorted.length ? asNumber(sorted[sorted.length - 1].price) : 0;
}

export function compareAt(product: ShopifyProduct): number {
  const compareValues = product.variants
    .map((variant) => asNumber(variant.compare_at_price))
    .filter((value) => value > 0);

  if (!compareValues.length) {
    return 0;
  }

  return Math.max(...compareValues);
}

export function savingsPercent(product: ShopifyProduct): number {
  const compare = compareAt(product);
  const current = minPrice(product);

  if (compare <= 0 || current <= 0 || current >= compare) {
    return 0;
  }

  return Math.round(((compare - current) / compare) * 100);
}

export function formatMoney(value: number): string {
  return currencyFormatter.format(value);
}

export function productImage(product: ShopifyProduct): string {
  return product.image?.src || product.images[0]?.src || "/placeholder.svg";
}

export function productTagList(product: ShopifyProduct): string[] {
  if (Array.isArray(product.tags)) {
    return product.tags
      .map((tag) => asText(tag).trim())
      .filter(Boolean);
  }

  return asText(product.tags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function readingTime(input: string): string {
  const words = stripHtml(input).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 140));
  return `${minutes} min read`;
}
