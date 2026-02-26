import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
});
const MAX_DISPLAY_COMPARE_MULTIPLIER = 12;

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

export function sanitizeRichHtml(input: unknown): string {
  const raw = asText(input);

  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\s(?:bis_size|data-mce-fragment|contenteditable)=("[^"]*"|'[^']*')/gi, "")
    .replace(/<img([^>]+)>/gi, (_full, attrs: string) => `<img${attrs} loading="lazy">`);
}

export function firstImageSrcFromHtml(input: unknown): string | null {
  const html = asText(input);
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function asNumber(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isPlausibleComparePrice(currentPrice: number, comparePrice: number): boolean {
  if (currentPrice <= 0 || comparePrice <= 0 || comparePrice <= currentPrice) {
    return false;
  }

  return comparePrice / currentPrice <= MAX_DISPLAY_COMPARE_MULTIPLIER;
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
    .map((variant) => {
      const currentPrice = asNumber(variant.price);
      const comparePrice = asNumber(variant.compare_at_price);
      return isPlausibleComparePrice(currentPrice, comparePrice) ? comparePrice : 0;
    })
    .filter((value) => value > 0);

  if (!compareValues.length) {
    return 0;
  }

  return Math.max(...compareValues);
}

export function savingsPercent(product: ShopifyProduct): number {
  const variantSavings = product.variants
    .map((variant) => {
      const currentPrice = asNumber(variant.price);
      const comparePrice = asNumber(variant.compare_at_price);

      if (!isPlausibleComparePrice(currentPrice, comparePrice)) {
        return 0;
      }

      return ((comparePrice - currentPrice) / comparePrice) * 100;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (variantSavings.length) {
    return Math.round(Math.max(...variantSavings));
  }

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

export function conciseTitle(input: string, maxChars = 76): string {
  const title = stripHtml(input);
  if (title.length <= maxChars) {
    return title;
  }

  const slice = title.slice(0, maxChars - 1);
  const boundary = slice.lastIndexOf(" ");
  const shortened = boundary > 24 ? slice.slice(0, boundary) : slice;
  return `${shortened.trimEnd()}…`;
}
