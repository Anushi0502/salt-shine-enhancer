const MINIMUM_TWO_BUNDLE_PRODUCT_HANDLES = new Set([
  "star-magic-payment-wand-extendable-touchscreen-pointer",
  "graduation-money-box-gift-holder-pull-out-cash-surprise",
  "hollowfly-graduation-money-box-pull-out-cash-gift-holder",
  "foot-callus-remover-tool-stainless-steel-pedicure-scraper-file",
  "motorcycle-face-mask-balaclava-windproof-breathable",
  "winter-motorcycle-face-mask-balaclava-windproof-thermal-neck-warmer",
  "tactical-motorcycle-face-mask-neck-gaiter-windproof-breathable",
  "three-hole-balaclava-face-mask-outdoor-sunscreen-head-cover",
  "motorcycle-balaclava-face-mask-breathable-windproof-riding-hood",
  "winter-fleece-balaclava-hood-thermal-windproof-neck-warmer",
  "winter-balaclava-face-mask-breathing-panel-windproof-thermal-hood",
  "breathing-valve-sports-face-mask-reusable-outdoor-cycling-riding",
  "graphic-balaclava-face-mask-uv-protection-outdoor-riding-hood",
  "motorcycle-goggles-detachable-face-mask-windproof-riding-eyewear",
  "winter-cycling-face-mask-neck-warmer-windproof-outdoor-cover",
  "full-face-balaclava-mask-breathable-windproof-riding-hood",
  "outdoors-silicone-folding-cup-with-hanging-hole-creative-water-cup-travel-portable-washing-cup-fashion-travel-silicone-cup",
]);

const MINIMUM_PRICE_THRESHOLD = 25;

function normalizeHandle(handle: string | null | undefined): string {
  return String(handle || "").trim().toLowerCase();
}

function normalizePrice(price: number | string | null | undefined): number {
  const value = typeof price === "number" ? price : Number(String(price ?? "").trim());
  return Number.isFinite(value) ? value : NaN;
}

export function getMinimumProductQuantity(handle: string | null | undefined, sellPrice?: number | string | null): number {
  const normalizedHandle = normalizeHandle(handle);
  const price = normalizePrice(sellPrice);

  if (MINIMUM_TWO_BUNDLE_PRODUCT_HANDLES.has(normalizedHandle)) {
    return 2;
  }

  if (Number.isFinite(price) && price > 0 && price < MINIMUM_PRICE_THRESHOLD) {
    return 2;
  }

  return 1;
}

export function isMinimumTwoBundleProduct(handle: string | null | undefined, sellPrice?: number | string | null): boolean {
  return getMinimumProductQuantity(handle, sellPrice) > 1;
}
