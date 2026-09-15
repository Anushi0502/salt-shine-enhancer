import {
  isHairColorCode,
  isHairProductEvidence,
  isLengthLikeValue,
  parseAnomalyMoney,
} from "./catalog-product-anomaly-audit.js";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.nodes)) return value.nodes;
  return [];
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).toLowerCase();
}

function productOptions(product) {
  return asArray(product?.options)
    .map((option, index) => ({
      id: text(option?.id),
      name: text(option?.name),
      position: Number(option?.position) || index + 1,
      values: asArray(option?.values).map(text).filter(Boolean),
    }))
    .filter((option) => option.id || option.name);
}

function variantCost(variant) {
  return parseAnomalyMoney(
    variant?.cost ??
      variant?.cost_per_item ??
      variant?.inventoryItem?.unitCost?.amount ??
      variant?.inventory_item?.cost,
  );
}

function optionTarget(issue, product) {
  const suggested = text(issue?.suggestedName);
  if (suggested) return suggested;
  if (issue?.reason === "size-label-hair-color-code" || issue?.reason === "length-label-hair-color-code") {
    return "Hair Color";
  }
  if (issue?.reason === "hair-color-label-length-value") return "Length";
  if (issue?.reason === "color-label-length-value") {
    return isHairProductEvidence(product) ? "Length" : "Size";
  }
  return "";
}

function optionValuesMatchTarget(values, target, product) {
  if (!values.length) return false;
  if (normalized(target) === "hair color") {
    return isHairProductEvidence(product) && values.every((value) => isHairColorCode(value, { hairProduct: true }));
  }
  if (["length", "size"].includes(normalized(target))) {
    return values.every(isLengthLikeValue);
  }
  return false;
}

function uniqueBy(items, key) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const value = text(item?.[key]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(item);
  }
  return result;
}

export function buildOptionRepairTasks(products = [], optionAnomalies = []) {
  const productById = new Map(asArray(products).map((product) => [text(product?.id), product]));
  const groups = new Map();
  const held = [];
  const repairableReasons = new Set([
    "color-label-length-value",
    "hair-color-label-length-value",
    "size-label-hair-color-code",
    "length-label-hair-color-code",
  ]);

  for (const issue of asArray(optionAnomalies)) {
    const productId = text(issue?.productId);
    const optionId = text(issue?.optionId);
    if (!repairableReasons.has(text(issue?.reason))) continue;
    if (!productId || !optionId) {
      held.push({
        ...issue,
        repairStatus: "held-missing-option-id",
        repairReason: "The live anomaly does not identify a mutable Shopify product option.",
      });
      continue;
    }
    const key = `${productId}|${optionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }

  const tasks = [];
  for (const issues of groups.values()) {
    const first = issues[0];
    const product = productById.get(text(first?.productId));
    const declaration = productOptions(product).find((option) => option.id === text(first?.optionId));
    const targetName = optionTarget(first, product);
    const currentValues = declaration?.values || uniqueBy(issues.map((issue) => ({ value: text(issue?.optionValue) })), "value").map((entry) => entry.value);
    const otherNames = productOptions(product)
      .filter((option) => option.id !== text(first?.optionId))
      .map((option) => normalized(option.name));

    const hold = (repairStatus, repairReason) => {
      held.push({
        productId: text(first?.productId),
        handle: text(first?.handle),
        title: text(first?.title),
        optionId: text(first?.optionId),
        currentName: text(declaration?.name || first?.optionName),
        targetName,
        values: currentValues,
        issueCount: issues.length,
        repairStatus,
        repairReason,
        evidence: issues.map((issue) => ({
          variantId: text(issue?.variantId),
          optionValue: text(issue?.optionValue),
          reason: text(issue?.reason),
          confidence: issue?.confidence ?? null,
        })),
      });
    };

    if (!product) {
      hold("held-product-missing", "The product is not present in the current active catalog snapshot.");
      continue;
    }
    if (!declaration?.id) {
      hold("held-option-missing", "The option declaration is not present in the current active catalog snapshot.");
      continue;
    }
    if (!targetName || !optionValuesMatchTarget(currentValues, targetName, product)) {
      hold("held-unsupported-option-evidence", "All declared option values must prove the same dimension or hair-color semantic before rename.");
      continue;
    }
    if (otherNames.includes(normalized(targetName))) {
      hold("held-option-name-collision", "Another product option already uses the target name; automatic rename could merge distinct dimensions.");
      continue;
    }

    const task = {
      productId: text(product.id),
      handle: text(product.handle),
      title: text(product.title),
      optionId: declaration.id,
      fromName: declaration.name,
      toName: targetName,
      values: currentValues,
      issueCount: issues.length,
      variantIds: uniqueBy(issues.map((issue) => ({ id: text(issue?.variantId) })), "id").map((entry) => entry.id),
      reason: "deterministic-option-label-value-contradiction",
      confidence: Math.min(...issues.map((issue) => Number(issue?.confidence) || 0).filter((value) => value > 0), 0.98),
      evidence: issues.map((issue) => ({
        variantId: text(issue?.variantId),
        optionValue: text(issue?.optionValue),
        reason: text(issue?.reason),
        valueKind: issue?.evidence?.valueKind || null,
      })),
      status: normalized(declaration.name) === normalized(targetName) ? "already-exact" : "planned",
    };
    tasks.push(task);
  }

  return { tasks, held };
}

export function buildCostDraftTasks(products = [], costAnomalies = []) {
  const productById = new Map(asArray(products).map((product) => [text(product?.id), product]));
  const groups = new Map();
  const held = [];
  for (const issue of asArray(costAnomalies)) {
    if (issue?.severity !== "draft" || issue?.quarantineEligible !== true) continue;
    const productId = text(issue?.productId);
    if (!productId) continue;
    if (!groups.has(productId)) groups.set(productId, []);
    groups.get(productId).push(issue);
  }

  const tasks = [];
  for (const [productId, issues] of groups) {
    const product = productById.get(productId);
    const variants = asArray(product?.variants).map((variant) => ({
      id: text(variant?.id),
      title: text(variant?.title),
      costPerItem: variantCost(variant),
    })).filter((variant) => variant.id);
    if (!product || !variants.length || variants.some((variant) => !Number.isFinite(variant.costPerItem) || variant.costPerItem < 0)) {
      held.push({
        productId,
        handle: text(product?.handle || issues[0]?.handle),
        title: text(product?.title || issues[0]?.title),
        repairStatus: "held-incomplete-cost-evidence",
        repairReason: "Every live variant must have a finite non-negative unit cost before drafting.",
      });
      continue;
    }
    const first = issues[0];
    tasks.push({
      productId,
      handle: text(product.handle),
      title: text(product.title),
      fromStatus: "ACTIVE",
      toStatus: "DRAFT",
      reason: "deterministic-cross-product-unit-cost-outlier",
      peerKey: text(first?.peerKey),
      productMedianCost: Number(first?.productMedianCost),
      variants,
      peerEvidence: first?.peerEvidence || null,
      anomalyCount: issues.length,
      status: "planned",
    });
  }

  return { tasks, held };
}

export function buildProductAnomalyRepairPlan(products = [], audit = {}) {
  const optionPlan = buildOptionRepairTasks(products, audit.optionAnomalies);
  const costPlan = buildCostDraftTasks(products, audit.costAnomalies);
  return {
    optionTasks: optionPlan.tasks,
    optionHeld: optionPlan.held,
    costTasks: costPlan.tasks,
    costHeld: costPlan.held,
    summary: {
      productsInspected: asArray(products).length,
      optionAnomalies: asArray(audit.optionAnomalies).length,
      optionTasks: optionPlan.tasks.length,
      optionAlreadyExact: optionPlan.tasks.filter((task) => task.status === "already-exact").length,
      optionHeld: optionPlan.held.length,
      costAnomalies: asArray(audit.costAnomalies).length,
      costDraftTasks: costPlan.tasks.length,
      costHeld: costPlan.held.length,
      priceAnomalies: asArray(audit.priceAnomalies).length,
      priceCritical: Number(audit.priceSummary?.critical || 0),
    },
  };
}

export { asArray, normalized, optionValuesMatchTarget, productOptions, variantCost };
