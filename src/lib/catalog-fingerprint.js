import { createHash } from "node:crypto";
import { normalizeHandleValue } from "./shopify-seo-batch.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function imageUrls(product) {
  const media = asArray(product?.media?.nodes || product?.media);
  const images = asArray(product?.images).concat(media);
  return [...new Set(images.map((image) => {
    if (typeof image === "string") return image;
    return image?.src || image?.url || image?.image?.url || "";
  }).filter(Boolean))].sort();
}

function visualKey(product) {
  return JSON.stringify([
    String(product?.id || ""),
    normalizeHandleValue(product?.handle),
    imageUrls(product),
  ]);
}

export function catalogVisualProductFingerprint(product) {
  return createHash("sha256").update(visualKey(product)).digest("hex");
}

export function catalogVisualFingerprint(products) {
  const keys = asArray(products)
    .map(visualKey)
    .filter((key) => key !== JSON.stringify(["", "", []]))
    .sort();
  return createHash("sha256").update(keys.join("\n")).digest("hex");
}
