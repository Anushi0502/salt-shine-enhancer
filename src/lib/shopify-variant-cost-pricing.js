import { formatMoneyValue, normalizePlainText, parseMoneyValue } from "./shopify-seo-batch.js";
import { extractVariantQuantity, variantLabel } from "./shopify-variant-pricing.js";

const DEFAULT_COST_TOLERANCE = 2;
const DEFAULT_CAMPAIGN_COST_PER_ORDER = 18;
const DEFAULT_MIN_CONTRIBUTION_MARGIN = 0.3;
const DEFAULT_CLOTHING_MIN_CONTRIBUTION_MARGIN = 0.43;
const DEFAULT_PRICE_OUTLIER_RATIO = 2.5;
const DEFAULT_PRICE_OUTLIER_MINIMUM_DELTA = 25;
const DEFAULT_VARIANT_PEER_OUTLIER_RATIO = 2.5;
const DEFAULT_VARIANT_PEER_OUTLIER_MINIMUM_DELTA = 25;
const DEFAULT_COST_BASED_POLICY_ID = "cost-band-v2-2026-08-24";
const DEFAULT_COST_BASED_OVERHEAD = 16;
const DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN = 0.3;
const DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN = 0.43;
export const DEFAULT_MARKET_PRICE_MARGIN_PERCENT = 0.2;
export const DEFAULT_MARKET_PRICE_MARGIN_MODE = "markup";
export const DEFAULT_MARKET_PRICE_MARGIN_POLICY_ID = "live-market-anchor-plus-20pct-2026-09-08";
const DEFAULT_COST_BASED_BANDS = Object.freeze([
  Object.freeze({ maxCost: 5, multiplier: 2.25 }),
  Object.freeze({ maxCost: 12, multiplier: 1.9 }),
  Object.freeze({ maxCost: 20, multiplier: 1.75 }),
  Object.freeze({ maxCost: 35, multiplier: 1.6 }),
  Object.freeze({ maxCost: 60, multiplier: 1.5 }),
  Object.freeze({ maxCost: 100, multiplier: 1.4 }),
  Object.freeze({ maxCost: null, multiplier: 1.35 }),
]);
const CLOTHING_EVIDENCE_PATTERN = /\b(?:apparel|blazer|blouse|cardigan|clothing|coat|dress|dresses|denim|fashion|gown|hoodie|jacket|jean|jumpsuit|leggings|pants|shirt|shorts|skirt|sweater|t[- ]?shirt|trousers|wear)\b/i;
const COLOR_TOKENS = new Set([
  "beige", "black", "blue", "brown", "clear", "coffee", "cyan", "gold", "gray", "grey", "green",
  "ivory", "khaki", "lavender", "lime", "mint", "navy", "orange", "pink", "purple", "red", "rose",
  "silver", "tan", "teal", "violet", "white", "wine", "yellow", "multicolor", "multi", "mixed", "mix", "colour", "color",
]);

function asVariantArray(product) {
  if (Array.isArray(product?.variants)) return product.variants;
  if (Array.isArray(product?.variants?.nodes)) return product.variants.nodes;
  return [];
}

function variantId(variant) {
  return normalizePlainText(variant?.admin_graphql_api_id || variant?.id || variant?.variantId);
}

function variantCost(variant) {
  return parseMoneyValue(
    variant?.cost_per_item ??
      variant?.cost ??
      variant?.inventoryItem?.unitCost?.amount ??
      variant?.inventory_item?.cost,
  );
}

function variantPrice(variant) {
  return parseMoneyValue(variant?.price);
}

function isQuantityTier(variant) {
  return extractVariantQuantity(variant) > 0;
}

export function peerBaseLabel(variant) {
  return variantLabel(variant)
    .toLowerCase()
    .replace(/\b(?:pack|set|lot|of)\s*\d+\b/g, " ")
    .replace(/\b\d+\s*(?:pcs?|pieces?|units?|packs?|pairs?)\b/g, " ")
    .replace(/\b(?:pcs?|pieces?|units?|packs?|pairs?)\s*[-:]?\s*\d+\b/g, " ")
    .replace(/\b\d+\s*(?:pack|set|lot)\b/g, " ")
    .replace(/\b(?:pack|set|lot)\b/g, " ")
    .replace(/\bmix\d+\b/g, " mix ")
    .replace(/[^a-z0-9.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !COLOR_TOKENS.has(token))
    .join(" ")
    .trim();
}

export function peerLabel(variant) {
  const quantity = extractVariantQuantity(variant);
  const label = peerBaseLabel(variant);
  return `${quantity}|${label || "color-peer"}`;
}

function roundMoneyUp(value) {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

function roundMoneyUpToRetail99(value) {
  const rounded = roundMoneyUp(value);
  let target = Math.floor(rounded) + 0.99;
  if (target + 0.000001 < rounded) target += 1;
  return Number(target.toFixed(2));
}

function medianNumber(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compareAtAnchor(entries, targetPrice) {
  const values = entries
    .filter((entry) => Math.abs(entry.price - targetPrice) < 0.005)
    .map((entry) => parseMoneyValue(entry.variant?.compare_at_price ?? entry.variant?.compareAtPrice))
    .filter((value) => Number.isFinite(value) && value > targetPrice);
  return medianNumber(values);
}

export function isClothingProduct(product) {
  const evidence = [
    product?.handle,
    product?.title,
    product?.product_type,
    product?.productType,
    Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags,
  ].filter(Boolean).join(" ");
  return CLOTHING_EVIDENCE_PATTERN.test(evidence);
}

export function costProtectedMinimumPrice(
  costValue,
  {
    campaignCostPerOrder = DEFAULT_CAMPAIGN_COST_PER_ORDER,
    minContributionMargin = DEFAULT_MIN_CONTRIBUTION_MARGIN,
    clothingMinContributionMargin = DEFAULT_CLOTHING_MIN_CONTRIBUTION_MARGIN,
    retailPriceEnding = false,
    priceFloor = 35,
  } = {},
) {
  const cost = Number(costValue);
  const campaignCost = Number(campaignCostPerOrder);
  const margin = Number(retailPriceEnding ? clothingMinContributionMargin : minContributionMargin);
  const floor = Number(priceFloor);
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(campaignCost) || campaignCost < 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return null;
  if (!Number.isFinite(floor) || floor < 0) return null;

  const contributionProtectedPrice = (cost + campaignCost) / (1 - margin);
  const target = Math.max(floor, contributionProtectedPrice);
  return (retailPriceEnding ? roundMoneyUpToRetail99(target) : roundMoneyUp(target)).toFixed(2);
}

function normalizedCostBands(bands) {
  const source = Array.isArray(bands) && bands.length ? bands : DEFAULT_COST_BASED_BANDS;
  const normalized = source
    .map((band) => ({
      maxCost: band?.maxCost === null || band?.maxCost === undefined || band?.maxCost === ""
        ? null
        : Number(band.maxCost),
      multiplier: Number(band?.multiplier),
    }))
    .filter((band) =>
      (band.maxCost === null || (Number.isFinite(band.maxCost) && band.maxCost >= 0)) &&
      Number.isFinite(band.multiplier) && band.multiplier > 0,
    )
    .sort((left, right) => {
      if (left.maxCost === null) return 1;
      if (right.maxCost === null) return -1;
      return left.maxCost - right.maxCost;
    });
  return normalized.length ? normalized : DEFAULT_COST_BASED_BANDS;
}

export function costBandFor(costValue, bands = DEFAULT_COST_BASED_BANDS) {
  const cost = Number(costValue);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return normalizedCostBands(bands).find((band) => band.maxCost === null || cost <= band.maxCost) || null;
}

export function costBasedTargetPrice(
  costValue,
  {
    overhead = DEFAULT_COST_BASED_OVERHEAD,
    minContributionMargin = DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN,
    clothingMinContributionMargin = DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN,
    clothing = false,
    priceFloor = 35,
    bands = DEFAULT_COST_BASED_BANDS,
  } = {},
) {
  const cost = Number(costValue);
  const fixedOverhead = Number(overhead);
  const margin = Number(clothing ? clothingMinContributionMargin : minContributionMargin);
  const floor = Number(priceFloor);
  const band = costBandFor(cost, bands);
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(fixedOverhead) || fixedOverhead < 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1 || !Number.isFinite(floor) || floor < 0 || !band) return null;

  const costWithOverhead = cost + fixedOverhead;
  const multiplierTarget = costWithOverhead * band.multiplier;
  const marginTarget = costWithOverhead / (1 - margin);
  return roundMoneyUpToRetail99(Math.max(floor, multiplierTarget, marginTarget)).toFixed(2);
}

export function marketPriceMarginTarget(
  marketPriceValue,
  {
    marginPercent = 0,
    mode = DEFAULT_MARKET_PRICE_MARGIN_MODE,
    priceFloor = 35,
  } = {},
) {
  const marketPrice = Number(marketPriceValue);
  const margin = Number(marginPercent);
  const floor = Number(priceFloor);
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return null;
  if (!Number.isFinite(floor) || floor < 0) return null;

  const base = mode === "gross-margin"
    ? marketPrice / (1 - margin)
    : mode === "markup"
      ? marketPrice * (1 + margin)
      : null;
  if (!Number.isFinite(base) || base <= 0) return null;
  return roundMoneyUpToRetail99(Math.max(floor, base)).toFixed(2);
}

function marketAnchorValue(marketAnchors, id) {
  const raw = marketAnchors instanceof Map ? marketAnchors.get(id) : marketAnchors?.[id];
  const value = raw && typeof raw === "object" ? raw.price ?? raw.value : raw;
  const parsed = parseMoneyValue(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function captureMarketAnchor(marketAnchors, id, value) {
  if (marketAnchors instanceof Map && !marketAnchors.has(id)) {
    marketAnchors.set(id, value);
  }
}

export function buildCostBasedVariantPricePlan(
  products = [],
  {
    overhead = DEFAULT_COST_BASED_OVERHEAD,
    priceFloor = 35,
    minContributionMargin = DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN,
    clothingMinContributionMargin = DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN,
    bands = DEFAULT_COST_BASED_BANDS,
    policyId = DEFAULT_COST_BASED_POLICY_ID,
    marketMarginPercent = 0,
    marketMarginMode = DEFAULT_MARKET_PRICE_MARGIN_MODE,
    marketMarginPolicyId = DEFAULT_MARKET_PRICE_MARGIN_POLICY_ID,
    marketAnchors = new Map(),
    captureMissingMarketAnchors = true,
  } = {},
) {
  const byHandle = new Map();
  const held = [];
  const blockingHeld = [];
  let variantsInspected = 0;
  const costDataProducts = new Set();
  let productsWithUpdates = 0;
  let variantsToUpdate = 0;
  let variantsWithMissingCost = 0;
  let variantsBelowTarget = 0;
  let variantsAboveTarget = 0;
  let compareAtClears = 0;
  let variantsAtMarketTarget = 0;
  let marketAnchorsCaptured = 0;

  for (const product of Array.isArray(products) ? products : []) {
    const clothing = isClothingProduct(product);
    const updates = [];
    const variants = asVariantArray(product);
    for (const variant of variants) {
      const id = variantId(variant);
      if (!id) continue;
      variantsInspected += 1;
      const cost = variantCost(variant);
      const currentPrice = variantPrice(variant);
      if (!Number.isFinite(cost) || cost < 0) {
        variantsWithMissingCost += 1;
        const review = {
          handle: normalizePlainText(product?.handle),
          variantId: id,
          label: variantLabel(variant),
          reason: "missing-live-cost-for-cost-based-pricing",
        };
        held.push(review);
        blockingHeld.push(review);
        continue;
      }
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        const review = {
          handle: normalizePlainText(product?.handle),
          variantId: id,
          label: variantLabel(variant),
          reason: "missing-live-price-for-cost-based-pricing",
        };
        held.push(review);
        blockingHeld.push(review);
        continue;
      }
      costDataProducts.add(normalizePlainText(product?.handle));
      const targetPrice = costBasedTargetPrice(cost, {
        overhead,
        priceFloor,
        minContributionMargin,
        clothingMinContributionMargin,
        clothing,
        bands,
      });
      if (!targetPrice) {
        const review = {
          handle: normalizePlainText(product?.handle),
          variantId: id,
          label: variantLabel(variant),
          reason: "invalid-cost-based-pricing-policy-input",
        };
        held.push(review);
        blockingHeld.push(review);
        continue;
      }
      const existingMarketAnchor = marketAnchorValue(marketAnchors, id);
      if (Number(marketMarginPercent) > 0 && !existingMarketAnchor && !captureMissingMarketAnchors) {
        const review = {
          handle: normalizePlainText(product?.handle),
          variantId: id,
          label: variantLabel(variant),
          reason: "missing-market-price-anchor-for-market-margin",
        };
        held.push(review);
        blockingHeld.push(review);
        continue;
      }
      const marketAnchor = existingMarketAnchor || currentPrice;
      if (Number(marketMarginPercent) > 0 && !existingMarketAnchor) {
        captureMarketAnchor(marketAnchors, id, currentPrice);
        marketAnchorsCaptured += 1;
      }
      const marketTargetPrice = Number(marketMarginPercent) > 0
        ? marketPriceMarginTarget(marketAnchor, {
          marginPercent: marketMarginPercent,
          mode: marketMarginMode,
          priceFloor,
        })
        : null;
      const costTargetNumber = Number(targetPrice);
      const marketTargetNumber = Number(marketTargetPrice);
      const finalTargetPrice = marketTargetPrice && Number.isFinite(marketTargetNumber)
        ? roundMoneyUpToRetail99(Math.max(costTargetNumber, marketTargetNumber)).toFixed(2)
        : targetPrice;
      if (marketTargetPrice && marketTargetNumber > costTargetNumber) variantsAtMarketTarget += 1;
      const currentCompareAt = parseMoneyValue(variant?.compare_at_price ?? variant?.compareAtPrice);
      const targetNumber = Number(finalTargetPrice);
      const compareAtValid = Number.isFinite(currentCompareAt) && currentCompareAt > targetNumber;
      const desiredCompareAt = compareAtValid ? formatMoneyValue(currentCompareAt) : null;
      const compareAtPresent = Number.isFinite(currentCompareAt) && currentCompareAt > 0;
      const priceChanged = Math.abs(currentPrice - targetNumber) >= 0.005;
      const compareAtChanged = compareAtPresent !== compareAtValid ||
        (compareAtValid && formatMoneyValue(currentCompareAt) !== desiredCompareAt);
      if (currentPrice < targetNumber) variantsBelowTarget += 1;
      if (currentPrice > targetNumber) variantsAboveTarget += 1;
      if (compareAtChanged && !compareAtValid && compareAtPresent) compareAtClears += 1;
      if (!priceChanged && !compareAtChanged) continue;
      updates.push({
        variantId: id,
        label: variantLabel(variant),
        quantity: extractVariantQuantity(variant),
        costPerItem: formatMoneyValue(cost),
        costBand: costBandFor(cost, bands),
        currentPrice: formatMoneyValue(currentPrice),
        price: finalTargetPrice,
        ...(Number(marketMarginPercent) > 0 ? {
          marketAnchorPrice: formatMoneyValue(marketAnchor),
          marketMarginPercent: Number(marketMarginPercent),
          marketMarginMode,
          marketTargetPrice: marketTargetPrice || null,
        } : {}),
        ...(compareAtValid || compareAtPresent ? { compareAtPrice: desiredCompareAt } : {}),
        ...(compareAtPresent && !compareAtValid ? { compareAtAction: "clear-invalid-compare-at" } : {}),
        reason: Number(marketMarginPercent) > 0
          ? `${policyId}-plus-${marketMarginPolicyId}`
          : `${policyId}-exact-cost-band-target`,
      });
    }
    if (updates.length) {
      const handle = normalizePlainText(product?.handle);
      byHandle.set(handle, updates);
      productsWithUpdates += 1;
      variantsToUpdate += updates.length;
    }
  }

  return {
    byHandle,
    held,
    blockingHeld,
    priceReview: [],
    summary: {
      products: Array.isArray(products) ? products.length : 0,
      variantsInspected,
      productsWithCostData: costDataProducts.size,
      productsWithUpdates,
      variantsToUpdate,
      heldGroups: held.length,
      blockingHeldGroups: blockingHeld.length,
      priceFloor: Number(Number(priceFloor).toFixed(2)),
      overhead: Number(Number(overhead).toFixed(2)),
      minContributionMargin: Number(Number(minContributionMargin).toFixed(4)),
      clothingMinContributionMargin: Number(Number(clothingMinContributionMargin).toFixed(4)),
      variantsWithMissingCost,
      variantsBelowTarget,
      variantsAboveTarget,
      compareAtClears,
      variantsAtMarketTarget,
      marketAnchorsCaptured,
      marketMarginPercent: Number(Number(marketMarginPercent).toFixed(4)),
      marketMarginMode,
      marketMarginPolicyId,
      pricingPolicy: policyId,
    },
    policy: {
      policyId,
      overhead,
      priceFloor,
      minContributionMargin,
      clothingMinContributionMargin,
      bands: normalizedCostBands(bands),
      marketMargin: {
        percent: Number(marketMarginPercent),
        mode: marketMarginMode,
        policyId: marketMarginPolicyId,
        anchor: "first governed live variant sell price; persisted per variant to prevent compounding",
      },
      formula: "max(price floor, (cost per item + overhead) * cost-band multiplier, (cost per item + overhead) / (1 - contribution margin)); round upward to .99",
      compareAt: "preserve only an existing compare-at strictly above the new target price; clear invalid values; never invent compare-at prices",
      variantDifferences: "calculate every variant independently from live cost, preserving variant and quantity records without peer-price flattening",
    },
  };
}

function groupByCost(variants, tolerance) {
  const sorted = [...variants].sort((left, right) => left.cost - right.cost || left.index - right.index);
  const groups = [];
  for (const variant of sorted) {
    const group = groups.at(-1);
    if (!group || variant.cost - group[0].cost > tolerance) {
      groups.push([variant]);
    } else {
      group.push(variant);
    }
  }
  return groups;
}

export function buildVariantCostPriceAlignmentPlan(
  products = [],
  {
    tolerance = DEFAULT_COST_TOLERANCE,
    priceFloor = 35,
    campaignCostPerOrder = DEFAULT_CAMPAIGN_COST_PER_ORDER,
    minContributionMargin = DEFAULT_MIN_CONTRIBUTION_MARGIN,
    clothingMinContributionMargin = DEFAULT_CLOTHING_MIN_CONTRIBUTION_MARGIN,
    priceOutlierRatio = DEFAULT_PRICE_OUTLIER_RATIO,
    priceOutlierMinimumDelta = DEFAULT_PRICE_OUTLIER_MINIMUM_DELTA,
    variantPeerOutlierRatio = DEFAULT_VARIANT_PEER_OUTLIER_RATIO,
    variantPeerOutlierMinimumDelta = DEFAULT_VARIANT_PEER_OUTLIER_MINIMUM_DELTA,
  } = {},
) {
  const byHandle = new Map();
  const held = [];
  const blockingHeld = [];
  const protectionProducts = new Set();
  let variantsInspected = 0;
  let productsWithCostData = 0;
  let productsWithUpdates = 0;
  let variantsToUpdate = 0;
  let variantsBelowProtectionTarget = 0;
  let priceOutlierGroups = 0;
  let priceOutlierVariants = 0;
  let variantPeerOutlierGroups = 0;
  let variantPeerOutlierVariants = 0;
  let compareAtOutlierVariants = 0;
  const priceReview = [];

  for (const product of Array.isArray(products) ? products : []) {
    const clothingProduct = isClothingProduct(product);
    const variants = asVariantArray(product)
      .map((variant, index) => ({
        variant,
        index,
        id: variantId(variant),
        label: variantLabel(variant),
        cost: variantCost(variant),
        price: variantPrice(variant),
        quantityTier: isQuantityTier(variant),
        protectionTarget: costProtectedMinimumPrice(variantCost(variant), {
          campaignCostPerOrder,
          minContributionMargin,
          clothingMinContributionMargin,
          retailPriceEnding: clothingProduct,
          priceFloor,
        }),
      }))
      .filter((entry) => entry.id && Number.isFinite(entry.cost) && entry.cost >= 0 && Number.isFinite(entry.price) && entry.price > 0);

    variantsInspected += variants.length;
    if (!variants.length) continue;
    productsWithCostData += 1;

    const quantityVariants = variants.filter((entry) => entry.quantityTier);
    const candidates = variants.filter((entry) => !entry.quantityTier);
    if (quantityVariants.length >= 2 && candidates.length >= 2) {
        held.push({
          handle: normalizePlainText(product?.handle),
          reason: "quantity-tier-variants-require-price-rule",
          variantIds: quantityVariants.map((entry) => entry.id),
      });
    }

    const targetByVariant = new Map();
    for (const entry of variants) {
      const protectionTarget = Number(entry.protectionTarget);
      const target = Number.isFinite(protectionTarget)
        ? Math.max(entry.price, priceFloor, protectionTarget)
        : Math.max(entry.price, priceFloor);
      targetByVariant.set(entry.id, target);
      if (Number.isFinite(protectionTarget) && entry.price + 0.005 < protectionTarget) {
        variantsBelowProtectionTarget += 1;
        protectionProducts.add(normalizePlainText(product?.handle));
      }
    }

    const alignedGroups = groupByCost(candidates, tolerance).filter((group) => group.length >= 2);
    const priceOutlierByVariant = new Map();
    const compareAtOutlierByVariant = new Map();
    const compareAtTargetByVariant = new Map();
    for (const group of alignedGroups) {
      const prices = group.map((entry) => entry.price).sort((left, right) => left - right);
      const minimumPrice = prices[0];
      const maximumPrice = prices.at(-1);
      const priceRatio = minimumPrice > 0 ? maximumPrice / minimumPrice : Infinity;
      const priceRange = maximumPrice - minimumPrice;
      const isWildPriceOutlier = priceRatio >= priceOutlierRatio &&
        priceRange >= priceOutlierMinimumDelta;
      const groupProtectionTarget = Math.max(
        priceFloor,
        ...group.map((entry) => Number(entry.protectionTarget || priceFloor)),
      );
      const normalTargetPrice = Math.max(
        groupProtectionTarget,
        ...prices,
      );
      const sortedMedian = prices.length % 2 === 1
        ? prices[Math.floor(prices.length / 2)]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
      const outlierAnchorPrice = group.length === 2 ? minimumPrice : sortedMedian;
      const targetPrice = isWildPriceOutlier
        ? Math.max(groupProtectionTarget, outlierAnchorPrice)
        : normalTargetPrice;

      if (isWildPriceOutlier) {
        priceOutlierGroups += 1;
        for (const entry of group) {
          priceOutlierByVariant.set(entry.id, {
            ratio: Number(priceRatio.toFixed(4)),
            range: Number(priceRange.toFixed(2)),
            groupSize: group.length,
            anchorPrice: Number(targetPrice.toFixed(2)),
          });
        }
      }

      const anchorCompareAt = compareAtAnchor(group, targetPrice);
      for (const entry of group) {
        targetByVariant.set(entry.id, targetPrice);
        if (entry.price > targetPrice + 0.005) compareAtTargetByVariant.set(entry.id, anchorCompareAt);
      }
    }

    // Quantity-tier products often have color/material variants that share the
    // same quantity. Use the option label and live cost parity to distinguish a
    // random price from a legitimate size/material/package price difference.
    const baseFamilyGroups = new Map();
    for (const entry of variants) {
      if (!entry.quantityTier) continue;
      const key = peerBaseLabel(entry.variant) || "color-peer";
      if (!baseFamilyGroups.has(key)) baseFamilyGroups.set(key, []);
      baseFamilyGroups.get(key).push(entry);
    }
    const peerGroups = new Map();
    for (const entry of variants) {
      if (!entry.quantityTier) continue;
      const key = peerLabel(entry.variant);
      if (!peerGroups.has(key)) peerGroups.set(key, []);
      peerGroups.get(key).push(entry);
    }
    for (const group of peerGroups.values()) {
      if (group.length < 2 || group.some((entry) => !Number.isFinite(entry.cost))) continue;
      const costs = group.map((entry) => entry.cost);
      if (Math.max(...costs) - Math.min(...costs) > tolerance) {
        const prices = group.map((entry) => entry.price);
        const minimumPrice = Math.min(...prices);
        const maximumPrice = Math.max(...prices);
        if (maximumPrice / Math.max(0.01, minimumPrice) >= variantPeerOutlierRatio && maximumPrice - minimumPrice >= variantPeerOutlierMinimumDelta) {
          priceReview.push({
            handle: normalizePlainText(product?.handle),
            reason: "variant-peer-price-outlier-costs-not-aligned",
            variantIds: group.map((entry) => entry.id),
            prices: prices.map((price) => formatMoneyValue(price)),
            costs: costs.map((cost) => formatMoneyValue(cost)),
          });
        }
        continue;
      }

      const compareAtValues = group
        .map((entry) => parseMoneyValue(entry.variant?.compare_at_price ?? entry.variant?.compareAtPrice))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (compareAtValues.length >= 2) {
        const minimumCompareAt = Math.min(...compareAtValues);
        const maximumCompareAt = Math.max(...compareAtValues);
        const compareAtRatio = maximumCompareAt / Math.max(0.01, minimumCompareAt);
        const compareAtRange = maximumCompareAt - minimumCompareAt;
        if (compareAtRatio >= variantPeerOutlierRatio && compareAtRange >= variantPeerOutlierMinimumDelta) {
          const compareAtTarget = compareAtValues.length === 2 ? minimumCompareAt : medianNumber(compareAtValues);
          for (const entry of group) {
            const currentCompareAt = parseMoneyValue(entry.variant?.compare_at_price ?? entry.variant?.compareAtPrice);
            if (!Number.isFinite(currentCompareAt) || Math.abs(currentCompareAt - compareAtTarget) < 0.005) continue;
            compareAtTargetByVariant.set(entry.id, compareAtTarget);
            compareAtOutlierVariants += 1;
            compareAtOutlierByVariant.set(entry.id, {
              ratio: Number(compareAtRatio.toFixed(4)),
              range: Number(compareAtRange.toFixed(2)),
              anchorCompareAt: formatMoneyValue(compareAtTarget),
            });
          }
        }
      }

      const prices = group.map((entry) => entry.price).sort((left, right) => left - right);
      const minimumPrice = prices[0];
      const maximumPrice = prices.at(-1);
      const priceRatio = minimumPrice > 0 ? maximumPrice / minimumPrice : Infinity;
      const priceRange = maximumPrice - minimumPrice;
      if (priceRatio < variantPeerOutlierRatio || priceRange < variantPeerOutlierMinimumDelta) continue;

      const counts = new Map();
      for (const price of prices) counts.set(price.toFixed(2), (counts.get(price.toFixed(2)) || 0) + 1);
      const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]));
      const maximumCount = ranked[0]?.[1] || 0;
      const dominantCandidates = ranked.filter(([, count]) => count === maximumCount);
      let targetPrice = Number(dominantCandidates[0]?.[0] || minimumPrice);
      if (dominantCandidates.length > 1) {
        const baseKey = peerBaseLabel(group[0].variant) || "color-peer";
        const baseFamily = baseFamilyGroups.get(baseKey) || [];
        const quantity = extractVariantQuantity(group[0].variant);
        const lowerQuantityMax = Math.max(
          0,
          ...baseFamily
            .filter((entry) => extractVariantQuantity(entry.variant) < quantity)
            .map((entry) => entry.price),
        );
        const tierCandidate = dominantCandidates
          .map(([price]) => Number(price))
          .filter((price) => price > lowerQuantityMax && lowerQuantityMax > 0);
        if (tierCandidate.length === 1) targetPrice = tierCandidate[0];
        else {
          priceReview.push({
            handle: normalizePlainText(product?.handle),
            reason: "variant-peer-price-outlier-ambiguous-price-cluster",
            variantIds: group.map((entry) => entry.id),
            prices: prices.map((price) => formatMoneyValue(price)),
            costs: costs.map((cost) => formatMoneyValue(cost)),
          });
          continue;
        }
      }
      const evidence = {
        ratio: Number(priceRatio.toFixed(4)),
        range: Number(priceRange.toFixed(2)),
        groupSize: group.length,
        quantity: group[0].quantityTier ? extractVariantQuantity(group[0].variant) : 0,
        costRange: Number((Math.max(...costs) - Math.min(...costs)).toFixed(2)),
        anchorPrice: formatMoneyValue(targetPrice),
      };
      variantPeerOutlierGroups += 1;
      const anchorCompareAt = compareAtAnchor(group, targetPrice);
      for (const entry of group) {
        variantPeerOutlierVariants += 1;
        targetByVariant.set(entry.id, Math.max(targetPrice, Number(entry.protectionTarget || priceFloor)));
        priceOutlierByVariant.set(entry.id, evidence);
        if (entry.price > targetPrice + 0.005) compareAtTargetByVariant.set(entry.id, anchorCompareAt);
      }

    }

    // A singleton quantity tier can still be obviously underpriced when its
    // same-family lower quantity tier is materially more expensive. This only
    // raises prices and requires at least two lower quantity observations.
    for (const family of baseFamilyGroups.values()) {
      const quantities = [...new Set(family.map((entry) => extractVariantQuantity(entry.variant)))].sort((left, right) => left - right);
      if (quantities.length < 2) continue;
      for (const quantity of quantities) {
        const currentEntries = family.filter((entry) => extractVariantQuantity(entry.variant) === quantity);
        const lowerEntries = family.filter((entry) => extractVariantQuantity(entry.variant) < quantity);
        if (currentEntries.length !== 1 || lowerEntries.length < 2 || currentEntries.some((entry) => !Number.isFinite(entry.cost))) continue;
        const costs = [...family].map((entry) => entry.cost).filter(Number.isFinite);
        if (Math.max(...costs) - Math.min(...costs) > tolerance) continue;
        const current = currentEntries[0];
        const lowerQuantityMax = Math.max(...lowerEntries.map((entry) => entry.price));
        if (current.price >= lowerQuantityMax) continue;
        const ratio = lowerQuantityMax / Math.max(0.01, current.price);
        const range = lowerQuantityMax - current.price;
        if (ratio < variantPeerOutlierRatio || range < variantPeerOutlierMinimumDelta) continue;
        targetByVariant.set(current.id, Math.max(lowerQuantityMax, Number(current.protectionTarget || priceFloor)));
        compareAtTargetByVariant.set(current.id, compareAtAnchor(family, lowerQuantityMax));
        const evidence = {
          ratio: Number(ratio.toFixed(4)),
          range: Number(range.toFixed(2)),
          groupSize: family.length,
          quantity,
          costRange: Number((Math.max(...costs) - Math.min(...costs)).toFixed(2)),
          anchorPrice: formatMoneyValue(lowerQuantityMax),
          reason: "same-family-quantity-price-inversion",
        };
        variantPeerOutlierGroups += 1;
        variantPeerOutlierVariants += 1;
        priceOutlierByVariant.set(current.id, evidence);
      }
    }

    const updates = [];
    for (const entry of variants) {
      const targetPrice = targetByVariant.get(entry.id) || priceFloor;
      const hasCompareAtOverride = compareAtTargetByVariant.has(entry.id);
      const currentCompareAt = parseMoneyValue(entry.variant?.compare_at_price ?? entry.variant?.compareAtPrice);
      const desiredCompareAt = hasCompareAtOverride ? compareAtTargetByVariant.get(entry.id) : currentCompareAt;
      const priceChanged = Math.abs(entry.price - targetPrice) >= 0.005;
      const compareAtChanged = hasCompareAtOverride && (
        (Number.isFinite(currentCompareAt) ? Number(currentCompareAt.toFixed(2)) : null) !==
        (Number.isFinite(desiredCompareAt) ? Number(desiredCompareAt.toFixed(2)) : null)
      );
      if (!priceChanged && !compareAtChanged) continue;
      const protectionApplied = Number.isFinite(Number(entry.protectionTarget)) &&
        targetPrice >= Number(entry.protectionTarget) &&
        entry.price + 0.005 < Number(entry.protectionTarget);
      const alignedWithCostGroup = alignedGroups.some((group) => group.some((groupEntry) => groupEntry.id === entry.id));
      const priceOutlierEvidence = priceOutlierByVariant.get(entry.id);
      const compareAtOutlierEvidence = compareAtOutlierByVariant.get(entry.id);
      if (priceOutlierEvidence && Math.abs(entry.price - targetPrice) >= 0.005) {
        priceOutlierVariants += 1;
      }
      const compareAt = desiredCompareAt;
      if (!hasCompareAtOverride && Number.isFinite(compareAt) && compareAt > 0 && compareAt <= targetPrice) {
        held.push({
          handle: normalizePlainText(product?.handle),
          reason: "compare-at-would-not-exceed-target-price",
          variantId: entry.id,
          label: entry.label,
          targetPrice: formatMoneyValue(targetPrice),
          compareAtPrice: formatMoneyValue(compareAt),
        });
      }
      updates.push({
        variantId: entry.id,
        label: entry.label,
        costPerItem: formatMoneyValue(entry.cost),
        currentPrice: formatMoneyValue(entry.price),
        price: formatMoneyValue(targetPrice),
        ...(hasCompareAtOverride
          ? { compareAtPrice: Number.isFinite(compareAt) && compareAt > targetPrice ? formatMoneyValue(compareAt) : null }
          : Number.isFinite(compareAt)
          ? { compareAtPrice: compareAt > targetPrice ? formatMoneyValue(compareAt) : null }
          : {}),
        ...((hasCompareAtOverride || Number.isFinite(compareAt)) && (!Number.isFinite(compareAt) || compareAt <= targetPrice)
          ? { compareAtAction: "clear-invalid-compare-at" }
          : {}),
        ...(priceOutlierEvidence ? { priceOutlierEvidence } : {}),
        reason: [
          alignedWithCostGroup ? "same-product-cost-within-tolerance" : "",
          protectionApplied ? "cost-and-campaign-contribution-protection" : "",
          priceOutlierEvidence ? "same-product-wild-price-outlier" : "",
          compareAtOutlierEvidence ? "same-product-compare-at-outlier" : "",
        ].filter(Boolean).join("+") || "approved-price-floor",
      });
    }

    if (updates.length) {
      byHandle.set(normalizePlainText(product?.handle), updates);
      productsWithUpdates += 1;
      variantsToUpdate += updates.length;
    }
  }

  return {
    byHandle,
    held,
    blockingHeld,
    summary: {
      products: Array.isArray(products) ? products.length : 0,
      variantsInspected,
      productsWithCostData,
      productsWithUpdates,
      variantsToUpdate,
      heldGroups: held.length,
      blockingHeldGroups: blockingHeld.length,
      tolerance: Number(tolerance.toFixed(2)),
      priceFloor: Number(priceFloor.toFixed(2)),
      campaignCostPerOrder: Number(Number(campaignCostPerOrder).toFixed(2)),
      minContributionMargin: Number(Number(minContributionMargin).toFixed(4)),
      variantsBelowProtectionTarget,
      productsBelowProtectionTarget: protectionProducts.size,
      priceOutlierRatio: Number(Number(priceOutlierRatio).toFixed(4)),
      priceOutlierMinimumDelta: Number(Number(priceOutlierMinimumDelta).toFixed(2)),
      priceOutlierGroups,
      priceOutlierVariants,
      variantPeerOutlierGroups,
      variantPeerOutlierVariants,
      compareAtOutlierVariants,
      priceReviewItems: priceReview.length,
    },
    priceReview,
  };
}

export {
  DEFAULT_CAMPAIGN_COST_PER_ORDER,
  DEFAULT_COST_TOLERANCE,
  DEFAULT_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_PRICE_OUTLIER_RATIO,
  DEFAULT_PRICE_OUTLIER_MINIMUM_DELTA,
  DEFAULT_VARIANT_PEER_OUTLIER_RATIO,
  DEFAULT_VARIANT_PEER_OUTLIER_MINIMUM_DELTA,
  DEFAULT_COST_BASED_POLICY_ID,
  DEFAULT_COST_BASED_OVERHEAD,
  DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_BANDS,
};
