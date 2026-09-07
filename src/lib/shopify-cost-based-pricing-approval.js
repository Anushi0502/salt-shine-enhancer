export const COST_BASED_PRICING_APPROVAL_ID = "salt-cost-based-pricing-2026-08-24-approved";
export const COST_BASED_PRICING_POLICY_ID = "cost-band-v2-2026-08-24";

export function validateCostBasedPricingApproval(approval, env = process.env) {
  if (approval?.approved !== true) throw new Error("Cost-based pricing approval is not marked approved.");
  if (String(approval?.approvalId || "").trim() !== COST_BASED_PRICING_APPROVAL_ID) {
    throw new Error(`Cost-based pricing approval must use ${COST_BASED_PRICING_APPROVAL_ID}.`);
  }
  if (String(approval?.scope?.strategyId || "") !== COST_BASED_PRICING_POLICY_ID) {
    throw new Error(`Cost-based pricing approval must use strategy ${COST_BASED_PRICING_POLICY_ID}.`);
  }
  if (Number(approval?.scope?.priceFloor) !== 35) {
    throw new Error("Cost-based pricing approval must retain the $35 minimum price floor.");
  }
  if (Number(approval?.scope?.overhead) !== 16) {
    throw new Error("Cost-based pricing approval must use the approved $16 overhead.");
  }
  if (approval?.scope?.variantPrices !== "calculate each variant independently from live cost; preserve variant and quantity differences") {
    throw new Error("Cost-based pricing approval must preserve independent variant and quantity pricing.");
  }
  if (approval?.scope?.compareAtPrices !== "preserve only valid existing compare-at prices above the new target; clear invalid values; never invent compare-at prices") {
    throw new Error("Cost-based pricing approval must validate compare-at prices separately without inventing them.");
  }
  if (env.SALT_CATALOG_COST_BASED_PRICING_APPROVED !== "1") {
    throw new Error("Set SALT_CATALOG_COST_BASED_PRICING_APPROVED=1 only for the approved cost-based pricing run.");
  }
  if (env.SALT_CATALOG_COST_BASED_PRICING_APPROVAL_ID !== COST_BASED_PRICING_APPROVAL_ID) {
    throw new Error("SALT_CATALOG_COST_BASED_PRICING_APPROVAL_ID does not match the approved cost-based pricing manifest.");
  }
  return COST_BASED_PRICING_APPROVAL_ID;
}
