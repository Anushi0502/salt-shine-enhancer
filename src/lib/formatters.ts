import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
});
const MAX_DISPLAY_COMPARE_MULTIPLIER = 12;
const NAMED_HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

export function decodeHtmlEntities(input: unknown): string {
  const raw = asText(input);
  if (!raw) {
    return "";
  }

  const decodedNumeric = raw.replace(/&#(x?[0-9a-f]+);/gi, (_full, code: string) => {
    const isHex = code.toLowerCase().startsWith("x");
    const value = Number.parseInt(isHex ? code.slice(1) : code, isHex ? 16 : 10);
    if (!Number.isFinite(value) || value <= 0) {
      return _full;
    }

    try {
      return String.fromCodePoint(value);
    } catch {
      return _full;
    }
  });

  const decodedNamed = decodedNumeric.replace(/&([a-z]+);/gi, (full, name: string) => {
    const replacement = NAMED_HTML_ENTITY_MAP[name.toLowerCase()];
    return replacement ?? full;
  });

  return decodedNamed;
}

export function polishPlainText(input: unknown): string {
  return decodeHtmlEntities(input)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function stripHtml(input: unknown): string {
  const text = asText(input);

  const stripped = text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return polishPlainText(stripped);
}

export function sanitizeRichHtml(input: unknown): string {
  const raw = asText(input);

  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "")
    .replace(/<img([^>]+)>/gi, (_full, attrs: string) => {
      let nextAttrs = attrs
        .replace(/\s(?:srcset|sizes)=("[^"]*"|'[^']*')/gi, "")
        .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "");

      const srcMatch = nextAttrs.match(/\ssrc=(["'])([^"']+)\1/i);
      if (srcMatch) {
        const normalized = normalizeShopifyAssetUrl(srcMatch[2]) || srcMatch[2];
        nextAttrs = nextAttrs.replace(srcMatch[0], ` src="${normalized}"`);
      }

      if (!/\sloading=(["'])lazy\1/i.test(nextAttrs)) {
        nextAttrs = `${nextAttrs} loading="lazy"`;
      }

      return `<img${nextAttrs}>`;
    });
}

export function firstImageSrcFromHtml(input: unknown): string | null {
  const html = asText(input);
  if (!html) {
    return null;
  }

  const imgTag = html.match(/<img[^>]*>/i)?.[0] || "";
  if (!imgTag) {
    return null;
  }

  const src =
    imgTag.match(/\ssrc=["']([^"']+)["']/i)?.[1] ||
    imgTag.match(/\sdata-src=["']([^"']+)["']/i)?.[1] ||
    imgTag.match(/\ssrcset=["']([^"']+)["']/i)?.[1]?.split(",")[0]?.trim()?.split(/\s+/)[0] ||
    "";

  return normalizeShopifyAssetUrl(src || null);
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

export function productImage(product: ShopifyProduct): string | null {
  return normalizeShopifyAssetUrl(product.image?.src || product.images[0]?.src);
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

function trimText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  const slice = input.slice(0, maxChars - 1);
  const boundary = slice.lastIndexOf(" ");
  const shortened = boundary > 24 ? slice.slice(0, boundary) : slice;
  return `${shortened.trimEnd()}…`;
}

function primaryTitleSegment(input: string): string {
  const title = stripHtml(input).replace(/\s+/g, " ").trim();
  if (!title) {
    return "";
  }

  const separators = [" | ", " – ", " — ", " - "];
  for (const separator of separators) {
    if (!title.includes(separator)) {
      continue;
    }

    const [segment] = title.split(separator);
    if (segment.trim().length >= 8) {
      return segment.trim();
    }
  }

  return title;
}

export function conciseTitle(input: string, maxChars = 58): string {
  const title = primaryTitleSegment(input);
  if (title.length <= maxChars) {
    return title;
  }

  return trimText(title, maxChars);
}

export function productBenefitText(product: ShopifyProduct, maxChars = 84): string {
  const description = stripHtml(product.body_html).replace(/\s+/g, " ").trim();
  const firstSentence = description.split(/(?<=[.!?])\s+/).find(Boolean)?.trim() || description;
  const fallback = product.product_type
    ? `${product.product_type} made easier to browse, gift, and use every day.`
    : "Useful everyday find selected to feel practical, giftable, and easy to shop.";

  return trimText(firstSentence || fallback, maxChars);
}
