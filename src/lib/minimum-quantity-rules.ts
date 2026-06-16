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

function normalizeHandle(handle: string | null | undefined): string {
  return String(handle || "").trim().toLowerCase();
}

export function getMinimumProductQuantity(handle: string | null | undefined): number {
  return MINIMUM_TWO_BUNDLE_PRODUCT_HANDLES.has(normalizeHandle(handle)) ? 2 : 1;
}

export function isMinimumTwoBundleProduct(handle: string | null | undefined): boolean {
  return getMinimumProductQuantity(handle) > 1;
}
