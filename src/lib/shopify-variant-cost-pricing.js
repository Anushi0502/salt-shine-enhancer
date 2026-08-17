import { formatMoneyValue, normalizePlainText, parseMoneyValue } from "./shopify-seo-batch.js";
import { extractVariantQuantity, variantLabel } from "./shopify-variant-pricing.js";

const DEFAULT_COST_TOLERANCE = 2;
const DEFAULT_CAMPAIGN_COST_PER_ORDER = 16;
const DEFAULT_MIN_CONTRIBUTION_MARGIN = 0.3;

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

function roundMoneyUp(value) {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export function costProtectedMinimumPrice(
  costValue,
  {
    campaignCostPerOrder = DEFAULT_CAMPAIGN_COST_PER_ORDER,
    minContributionMargin = DEFAULT_MIN_CONTRIBUTION_MARGIN,
    priceFloor = 35,
  } = {},
) {
  const cost = Number(costValue);
  const campaignCost = Number(campaignCostPerOrder);
  const margin = Number(minContributionMargin);
  const floor = Number(priceFloor);
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(campaignCost) || campaignCost < 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return null;
  if (!Number.isFinite(floor) || floor < 0) return null;

  const contributionProtectedPrice = (cost + campaignCost) / (1 - margin);
  return roundMoneyUp(Math.max(floor, contributionProtectedPrice)).toFixed(2);
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

  for (const product of Array.isArray(products) ? products : []) {
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
    for (const group of alignedGroups) {
      const targetPrice = Math.max(
        priceFloor,
        ...group.map((entry) => entry.price),
        ...group.map((entry) => Number(targetByVariant.get(entry.id) || priceFloor)),
      );
      for (const entry of group) targetByVariant.set(entry.id, targetPrice);
    }

    const updates = [];
    for (const entry of variants) {
      const targetPrice = targetByVariant.get(entry.id) || priceFloor;
      if (Math.abs(entry.price - targetPrice) < 0.005) continue;
      const protectionApplied = Number.isFinite(Number(entry.protectionTarget)) &&
        targetPrice >= Number(entry.protectionTarget) &&
        entry.price + 0.005 < Number(entry.protectionTarget);
      const alignedWithCostGroup = alignedGroups.some((group) => group.some((groupEntry) => groupEntry.id === entry.id));
      const compareAt = parseMoneyValue(entry.variant?.compare_at_price ?? entry.variant?.compareAtPrice);
      if (Number.isFinite(compareAt) && compareAt > 0 && compareAt <= targetPrice) {
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
        ...(Number.isFinite(compareAt)
          ? { compareAtPrice: compareAt > targetPrice ? formatMoneyValue(compareAt) : null }
          : {}),
        ...(Number.isFinite(compareAt) && compareAt <= targetPrice ? { compareAtAction: "clear-invalid-compare-at" } : {}),
        reason: [
          alignedWithCostGroup ? "same-product-cost-within-tolerance" : "",
          protectionApplied ? "cost-and-campaign-contribution-protection" : "",
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
    },
  };
}

export {
  DEFAULT_CAMPAIGN_COST_PER_ORDER,
  DEFAULT_COST_TOLERANCE,
  DEFAULT_MIN_CONTRIBUTION_MARGIN,
};
