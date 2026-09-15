const OPTION_KIND_PATTERNS = Object.freeze({
  color: /\bcolou?r\b|\bshade\b|\bhue\b|\btone\b|\bfinish\b/i,
  hairColor: /\bhair\s+colou?r\b|\bwig\s+colou?r\b|\bhair\s+shade\b/i,
  length: /\blength\b|\bdimension\b|\bheight\b|\bwidth\b|\bdepth\b|\bmeasure(?:ment)?\b/i,
  size: /\bsize\b|\bcapacity\b|\bvolume\b/i,
});

const LENGTH_VALUE_PATTERN = /^\s*\d+(?:\.\d+)?\s*(?:inches?|in|cm|mm|meters?|metres?|m|ft|feet)\s*$/i;
const GENERIC_PRODUCT_TYPE_PATTERN = /^(?:0|default|product|item|general|other|miscellaneous?)$/i;

const PRICE_PEER_PATTERNS = Object.freeze([
  ["earbuds-case", /\bearbuds?\b.{0,24}\bcase\b|\bcase\b.{0,24}\bearbuds?\b/i],
  ["phone-case", /\b(?:phone|iphone|samsung|airpods?)\b.{0,24}\bcase\b|\bcase\b.{0,24}\b(?:phone|iphone|samsung)\b/i],
  ["umbrella", /\bumbrellas?\b/i],
  ["wig", /\bwigs?\b|\bhuman\s+hair\b|\blace\s+(?:front|frontal)\b/i],
  ["shoe", /\b(?:shoes?|sneakers?|boots?|sandals?|slippers?|footwear)\b/i],
  ["shirt", /\b(?:t[- ]?shirts?|shirts?|polos?|blouses?)\b/i],
  ["dress", /\bdresses?\b|\bgowns?\b/i],
  ["pants", /\b(?:pants?|jeans?|trousers?|leggings?|shorts?)\b/i],
  ["hat", /\b(?:hats?|caps?|beanies?|fedora)\b/i],
  ["necklace", /\bnecklaces?\b/i],
  ["bracelet", /\bbracelets?\b/i],
  ["earrings", /\bearrings?\b/i],
  ["ring", /\brings?\b/i],
  ["bag", /\b(?:bags?|backpacks?|purses?|wallets?|totes?|luggage)\b/i],
  ["bottle", /\bbottles?\b/i],
  ["lunch-box", /\blunch\s*boxes?\b|\blunch\s*bags?\b/i],
  ["pencil-case", /\bpencil\s+cases?\b/i],
  ["makeup", /\b(?:makeup|cosmetic|lipstick|lip\s+gloss|mascara|blush)\b/i],
  ["serum", /\bserums?\b/i],
  ["shampoo", /\bshampoos?\b/i],
  ["tool", /\btools?\b/i],
  ["toy", /\btoys?\b/i],
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.nodes)) return value.nodes;
  return [];
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeAnomalyText(value) {
  return text(value).toLowerCase();
}

export function parseAnomalyMoney(value) {
  if (value && typeof value === "object") return parseAnomalyMoney(value.amount ?? value.value);
  const raw = text(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function productEvidence(product) {
  return [
    product?.title,
    product?.handle,
    product?.productType,
    product?.product_type,
    product?.vendor,
    Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags,
  ].filter(Boolean).join(" ");
}

export function isHairProductEvidence(product) {
  return /\b(?:wigs?|human\s+hair|hair\s+extensions?|lace\s+(?:front|frontal)|weaves?|toupees?|hairpieces?)\b/i.test(
    productEvidence(product),
  );
}

export function isLengthLikeValue(value) {
  const normalized = text(value).replace(/\s+/g, " ");
  return LENGTH_VALUE_PATTERN.test(normalized) || /^(?:short|medium|long)\s+length$/i.test(normalized);
}

export function isHairColorCode(value, { hairProduct = false } = {}) {
  const normalized = text(value).replace(/\s+/g, "");
  if (!hairProduct || !normalized || /^defaulttitle$/i.test(normalized)) return false;
  if (/^#\d{1,3}[a-z]?(?:[/-]\d{1,3}[a-z]?)?$/i.test(normalized)) return true;
  if (/^(?:t?\d{1,3}[a-z])(?:[/-]\d{1,3}[a-z]?)?$/i.test(normalized)) return true;
  return /^(?:\d{3}|(?:t)?\d{1,2}[a-z])(?:[/-]\d{1,3}[a-z]?)?$/i.test(normalized);
}

function optionNameKind(name) {
  const normalized = text(name);
  if (!normalized || /^default\s+title$/i.test(normalized) || /^title$/i.test(normalized)) return "default";
  if (OPTION_KIND_PATTERNS.hairColor.test(normalized)) return "hairColor";
  if (OPTION_KIND_PATTERNS.length.test(normalized)) return "length";
  if (OPTION_KIND_PATTERNS.color.test(normalized)) return "color";
  if (OPTION_KIND_PATTERNS.size.test(normalized)) return "size";
  return "other";
}

function productOptions(product) {
  return asArray(product?.options)
    .map((option, index) => ({
      id: text(option?.id),
      name: text(option?.name),
      position: Number(option?.position) || index + 1,
      values: asArray(option?.values).map(text).filter(Boolean),
    }))
    .filter((option) => option.name);
}

function selectedOptions(variant) {
  return asArray(variant?.selectedOptions ?? variant?.selected_options)
    .map((option, index) => ({
      name: text(option?.name),
      value: text(option?.value),
      position: index + 1,
    }))
    .filter((option) => option.name || option.value);
}

function issueKey(issue) {
  return [issue.variantId, issue.optionName, issue.optionValue, issue.reason].map(text).join("|");
}

function baseIssue(product, variant, fields) {
  return {
    productId: product?.id || null,
    handle: text(product?.handle),
    title: text(product?.title),
    variantId: variant?.id || null,
    variantTitle: text(variant?.title),
    ...fields,
  };
}

export function detectOptionAnomalies(product) {
  const definitions = productOptions(product);
  const definitionByName = new Map(definitions.map((option) => [normalizeAnomalyText(option.name), option]));
  const hairProduct = isHairProductEvidence(product);
  const dimensionOptionName = hairProduct ? "Length" : "Size";
  const issues = [];
  const seen = new Set();
  const add = (variant, fields) => {
    const issue = baseIssue(product, variant, fields);
    const key = issueKey(issue);
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const variant of asArray(product?.variants)) {
    const options = selectedOptions(variant);
    for (const option of options) {
      const normalizedName = normalizeAnomalyText(option.name);
      const definition = definitionByName.get(normalizedName);
      if (definitions.length && !definition) {
        add(variant, {
          reason: "selected-option-name-not-in-product-options",
          optionName: option.name,
          optionValue: option.value,
          severity: "high",
          confidence: 1,
          evidence: { selectedOption: option, declaredOptionNames: definitions.map((entry) => entry.name) },
        });
      } else if (definition && definition.values.length && !definition.values.some((value) => normalizeAnomalyText(value) === normalizeAnomalyText(option.value))) {
        add(variant, {
          reason: "selected-option-value-not-in-product-options",
          optionName: option.name,
          optionValue: option.value,
          severity: "high",
          confidence: 1,
          evidence: { selectedOption: option, declaredValues: definition.values },
        });
      }

      const kind = optionNameKind(option.name);
      const lengthValue = isLengthLikeValue(option.value);
      const hairColorValue = isHairColorCode(option.value, { hairProduct });
      if (kind === "color" && lengthValue) {
        add(variant, {
          reason: "color-label-length-value",
          optionId: definition?.id || null,
          optionName: option.name,
          optionValue: option.value,
          suggestedName: dimensionOptionName,
          severity: "high",
          confidence: 0.98,
          evidence: { valueKind: "length", value: option.value },
        });
      }
      if (kind === "size" && hairColorValue) {
        add(variant, {
          reason: "size-label-hair-color-code",
          optionId: definition?.id || null,
          optionName: option.name,
          optionValue: option.value,
          suggestedName: "Hair Color",
          severity: "high",
          confidence: 0.98,
          evidence: { valueKind: "hair-color-code", value: option.value, hairProduct },
        });
      }
      if (kind === "hairColor" && lengthValue) {
        add(variant, {
          reason: "hair-color-label-length-value",
          optionId: definition?.id || null,
          optionName: option.name,
          optionValue: option.value,
          suggestedName: "Length",
          severity: "high",
          confidence: 0.98,
          evidence: { valueKind: "length", value: option.value, hairProduct },
        });
      }
      if (kind === "length" && hairColorValue) {
        add(variant, {
          reason: "length-label-hair-color-code",
          optionId: definition?.id || null,
          optionName: option.name,
          optionValue: option.value,
          suggestedName: "Hair Color",
          severity: "high",
          confidence: 0.98,
          evidence: { valueKind: "hair-color-code", value: option.value, hairProduct },
        });
      }
    }

    if (hairProduct) {
      const hasColorLabelledLength = options.some((option) => optionNameKind(option.name) === "color" && isLengthLikeValue(option.value));
      const hasSizeLabelledHairColor = options.some((option) => optionNameKind(option.name) === "size" && isHairColorCode(option.value, { hairProduct }));
      if (hasColorLabelledLength && hasSizeLabelledHairColor) {
        add(variant, {
          reason: "option-label-value-swap",
          optionName: "Color / Size",
          optionValue: options.map((option) => `${option.name}=${option.value}`).join("; "),
          suggestedNames: { color: "Length", size: "Hair Color" },
          severity: "critical",
          confidence: 0.99,
          evidence: { selectedOptions: options, hairProduct },
        });
      }
    }
  }

  return issues;
}

export function pricePeerKey(product) {
  const evidence = productEvidence(product);
  for (const [key, pattern] of PRICE_PEER_PATTERNS) {
    if (pattern.test(evidence)) return key;
  }
  const productType = text(product?.productType ?? product?.product_type).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (productType && !GENERIC_PRODUCT_TYPE_PATTERN.test(productType) && productType.split(" ").length <= 4) return `type:${productType}`;
  return "";
}

export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values, fraction) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((sorted.length - 1) * fraction)));
  return sorted[index];
}

export function detectPriceAnomalies(products, {
  priceFloor = 0,
  minimumPeerProducts = 5,
  peerRatio = 4,
  peerMinimumDelta = 100,
  sameProductRatio = 4,
  sameProductMinimumDelta = 100,
  costTargetForVariant = null,
} = {}) {
  const productRecords = [];
  const groups = new Map();
  for (const product of asArray(products)) {
    const variants = asArray(product?.variants).map((variant, index) => ({
      variant,
      index,
      price: parseAnomalyMoney(variant?.price),
      compareAtPrice: parseAnomalyMoney(variant?.compareAtPrice ?? variant?.compare_at_price),
      cost: parseAnomalyMoney(variant?.cost ?? variant?.cost_per_item ?? variant?.inventoryItem?.unitCost?.amount),
    })).filter((entry) => Number.isFinite(entry.price) && entry.price > 0);
    if (!variants.length) continue;
    const productMedian = median(variants.map((entry) => entry.price));
    const key = pricePeerKey(product);
    const record = { product, variants, productMedian, peerKey: key };
    productRecords.push(record);
    if (key) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
  }

  const anomalies = [];
  const seen = new Set();
  const add = (record, entry, fields) => {
    const issue = {
      productId: record.product?.id || null,
      handle: text(record.product?.handle),
      title: text(record.product?.title),
      variantId: entry?.variant?.id || null,
      variantTitle: text(entry?.variant?.title),
      currentPrice: Number.isFinite(entry?.price) ? Number(entry.price.toFixed(2)) : null,
      compareAtPrice: Number.isFinite(entry?.compareAtPrice) ? Number(entry.compareAtPrice.toFixed(2)) : null,
      costPerItem: Number.isFinite(entry?.cost) ? Number(entry.cost.toFixed(2)) : null,
      peerKey: record.peerKey,
      ...fields,
    };
    const key = [issue.variantId, issue.reason, issue.peerKey, issue.currentPrice, issue.compareAtPrice].map(text).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    anomalies.push(issue);
  };

  for (const record of productRecords) {
    const peers = (groups.get(record.peerKey) || []).filter((peer) => peer !== record);
    const peerMedians = peers.map((peer) => peer.productMedian).filter((value) => Number.isFinite(value));
    const peerMedian = median(peerMedians);
    const peerP95 = percentile(peerMedians, 0.95);
    const peerCount = peers.length;
    for (const entry of record.variants) {
      if (Number.isFinite(priceFloor) && priceFloor > 0 && entry.price + 0.01 < priceFloor) {
        add(record, entry, {
          reason: "below-price-floor",
          severity: "critical",
          confidence: 1,
          priceFloor: Number(priceFloor.toFixed(2)),
          evidence: { currentPrice: entry.price, priceFloor },
        });
      }
      if (Number.isFinite(entry.compareAtPrice) && entry.compareAtPrice + 0.01 < entry.price) {
        add(record, entry, {
          reason: "compare-at-below-current-price",
          severity: "critical",
          confidence: 1,
          evidence: { currentPrice: entry.price, compareAtPrice: entry.compareAtPrice },
        });
      }
      const costTarget = typeof costTargetForVariant === "function"
        ? parseAnomalyMoney(costTargetForVariant(record.product, entry.variant, entry.cost))
        : null;
      if (Number.isFinite(costTarget) && entry.price + 0.01 < costTarget) {
        add(record, entry, {
          reason: "below-cost-policy-target",
          severity: "policy",
          confidence: 1,
          costTargetPrice: Number(costTarget.toFixed(2)),
          evidence: { costPerItem: entry.cost, costTargetPrice: costTarget },
        });
      }
      if (peerCount >= minimumPeerProducts && Number.isFinite(peerMedian)) {
        const ratio = entry.price / Math.max(0.01, peerMedian);
        const delta = entry.price - peerMedian;
        if (ratio >= peerRatio && delta >= peerMinimumDelta && (!Number.isFinite(peerP95) || entry.price >= peerP95)) {
          add(record, entry, {
            reason: "cross-product-peer-price-outlier",
            severity: ratio >= peerRatio * 1.5 ? "critical" : "review",
            confidence: ratio >= peerRatio * 1.5 ? 0.97 : 0.9,
            peerEvidence: {
              peerProducts: peerCount,
              peerMedianPrice: Number(peerMedian.toFixed(2)),
              peerP95Price: Number(peerP95.toFixed(2)),
              ratio: Number(ratio.toFixed(3)),
              delta: Number(delta.toFixed(2)),
            },
          });
        }
        if (Number.isFinite(entry.compareAtPrice)) {
          const compareRatio = entry.compareAtPrice / Math.max(0.01, peerMedian);
          const compareDelta = entry.compareAtPrice - peerMedian;
          if (compareRatio >= peerRatio && compareDelta >= peerMinimumDelta && (!Number.isFinite(peerP95) || entry.compareAtPrice >= peerP95)) {
            add(record, entry, {
              reason: "cross-product-peer-compare-at-outlier",
              severity: "review",
              confidence: compareRatio >= peerRatio * 1.5 ? 0.82 : 0.75,
              peerEvidence: {
                peerProducts: peerCount,
                peerMedianPrice: Number(peerMedian.toFixed(2)),
                peerP95Price: Number(peerP95.toFixed(2)),
                ratio: Number(compareRatio.toFixed(3)),
                delta: Number(compareDelta.toFixed(2)),
              },
            });
          }
        }
      }
    }

    if (record.variants.length >= 3 && Number.isFinite(record.productMedian)) {
      const largest = [...record.variants].sort((left, right) => right.price - left.price)[0];
      const ratio = largest.price / Math.max(0.01, record.productMedian);
      const delta = largest.price - record.productMedian;
      if (ratio >= sameProductRatio && delta >= sameProductMinimumDelta) {
        add(record, largest, {
          reason: "same-product-variant-price-dispersion",
          severity: "review",
          confidence: 0.82,
          peerEvidence: {
            productVariants: record.variants.length,
            productMedianPrice: Number(record.productMedian.toFixed(2)),
            ratio: Number(ratio.toFixed(3)),
            delta: Number(delta.toFixed(2)),
          },
        });
      }
    }
  }

  return {
    anomalies,
    summary: {
      productsInspected: productRecords.length,
      variantsInspected: productRecords.reduce((total, record) => total + record.variants.length, 0),
      peerGroups: groups.size,
      peerProductsWithEnoughComparables: [...groups.values()].filter((group) => group.length - 1 >= minimumPeerProducts).length,
      anomalies: anomalies.length,
      critical: anomalies.filter((issue) => issue.severity === "critical").length,
      policy: anomalies.filter((issue) => issue.severity === "policy").length,
      review: anomalies.filter((issue) => issue.severity === "review").length,
    },
  };
}

export function detectCostAnomalies(products, {
  minimumPeerProducts = 5,
  peerRatio = 4,
  peerMinimumDelta = 100,
} = {}) {
  const productRecords = [];
  const groups = new Map();
  for (const product of asArray(products)) {
    const variants = asArray(product?.variants).map((variant) => ({
      variant,
      cost: parseAnomalyMoney(variant?.cost ?? variant?.cost_per_item ?? variant?.inventoryItem?.unitCost?.amount),
    }));
    if (!variants.length || variants.some((entry) => !Number.isFinite(entry.cost) || entry.cost < 0)) continue;
    const productMedianCost = median(variants.map((entry) => entry.cost));
    const peerKey = pricePeerKey(product);
    if (!Number.isFinite(productMedianCost) || !peerKey) continue;
    const record = { product, variants, productMedianCost, peerKey };
    productRecords.push(record);
    if (!groups.has(peerKey)) groups.set(peerKey, []);
    groups.get(peerKey).push(record);
  }

  const anomalies = [];
  const seen = new Set();
  const add = (record, entry, fields) => {
    const issue = {
      productId: record.product?.id || null,
      handle: text(record.product?.handle),
      title: text(record.product?.title),
      variantId: entry?.variant?.id || null,
      variantTitle: text(entry?.variant?.title),
      costPerItem: Number.isFinite(entry?.cost) ? Number(entry.cost.toFixed(2)) : null,
      productMedianCost: Number.isFinite(record.productMedianCost) ? Number(record.productMedianCost.toFixed(2)) : null,
      peerKey: record.peerKey,
      ...fields,
    };
    const key = [issue.productId, issue.reason, issue.peerKey, issue.productMedianCost].map(text).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    anomalies.push(issue);
  };

  for (const record of productRecords) {
    const peers = (groups.get(record.peerKey) || []).filter((peer) => peer !== record);
    const peerMedians = peers.map((peer) => peer.productMedianCost).filter((value) => Number.isFinite(value));
    const peerMedian = median(peerMedians);
    const peerP95 = percentile(peerMedians, 0.95);
    const peerCount = peers.length;
    if (peerCount < minimumPeerProducts || !Number.isFinite(peerMedian) || peerMedian <= 0) continue;
    const ratio = record.productMedianCost / peerMedian;
    const delta = record.productMedianCost - peerMedian;
    if (ratio < peerRatio || delta < peerMinimumDelta || (Number.isFinite(peerP95) && record.productMedianCost < peerP95)) continue;
    for (const entry of record.variants) {
      add(record, entry, {
        reason: "cross-product-peer-cost-outlier",
        severity: "draft",
        confidence: ratio >= peerRatio * 2 ? 0.97 : 0.9,
        quarantineEligible: true,
        peerEvidence: {
          peerProducts: peerCount,
          peerMedianCost: Number(peerMedian.toFixed(2)),
          peerP95Cost: Number(peerP95.toFixed(2)),
          ratio: Number(ratio.toFixed(3)),
          delta: Number(delta.toFixed(2)),
        },
      });
    }
  }

  return {
    anomalies,
    summary: {
      productsInspected: productRecords.length,
      variantsInspected: productRecords.reduce((total, record) => total + record.variants.length, 0),
      peerGroups: groups.size,
      anomalies: anomalies.length,
      draft: anomalies.filter((issue) => issue.severity === "draft").length,
      review: anomalies.filter((issue) => issue.severity === "review").length,
      quarantineEligible: anomalies.filter((issue) => issue.quarantineEligible).length,
    },
  };
}

export function buildProductAnomalyAudit(products, options = {}) {
  const optionAnomalies = asArray(products).flatMap((product) => detectOptionAnomalies(product));
  const priceAudit = detectPriceAnomalies(products, options);
  const costAudit = detectCostAnomalies(products, options);
  const optionEvidenceMissing = asArray(products).filter((product) => {
    const definitions = productOptions(product);
    const variants = asArray(product?.variants);
    return !definitions.length && !variants.some((variant) => selectedOptions(variant).length);
  }).length;
  return {
    optionAnomalies,
    priceAnomalies: priceAudit.anomalies,
    costAnomalies: costAudit.anomalies,
    priceSummary: priceAudit.summary,
    costSummary: costAudit.summary,
    summary: {
      productsInspected: asArray(products).length,
      productsWithOptionAnomalies: new Set(optionAnomalies.map((issue) => issue.productId || issue.handle)).size,
      optionAnomalies: optionAnomalies.length,
      optionCritical: optionAnomalies.filter((issue) => issue.severity === "critical").length,
      optionReview: optionAnomalies.filter((issue) => issue.severity === "review").length,
      optionEvidenceMissing,
      productsWithPriceAnomalies: new Set(priceAudit.anomalies.map((issue) => issue.productId || issue.handle)).size,
      priceAnomalies: priceAudit.anomalies.length,
      priceCritical: priceAudit.summary.critical,
      pricePolicy: priceAudit.summary.policy,
      priceReview: priceAudit.summary.review,
      productsWithCostAnomalies: new Set(costAudit.anomalies.map((issue) => issue.productId || issue.handle)).size,
      costAnomalies: costAudit.anomalies.length,
      costDraft: costAudit.summary.draft,
      costReview: costAudit.summary.review,
    },
  };
}

export { asArray, optionNameKind, productOptions, selectedOptions };
