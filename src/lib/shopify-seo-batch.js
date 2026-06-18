function asText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function normalizeKey(value) {
  return asText(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function hasMeaningfulValue(value) {
  return normalizeWhitespace(value) !== "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (hasMeaningfulValue(value)) {
      return value;
    }
  }

  return "";
}

export function normalizePlainText(input) {
  return normalizeWhitespace(input);
}

export function normalizeHtmlValue(input) {
  return asText(input).replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
}

function normalizeSlug(input) {
  const raw = normalizePlainText(input);
  if (!raw) {
    return "";
  }

  const handleCandidate = raw.includes("://") || raw.includes("/products/") ? raw.split("?")[0] : raw;
  const slug = handleCandidate
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "";
}

export function normalizeHandleValue(input) {
  return normalizeSlug(input);
}

export function normalizeUrlForMatch(input) {
  const raw = normalizePlainText(input);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  }
}

export function parseMoneyValue(input) {
  const raw = normalizePlainText(input);
  if (!raw) {
    return null;
  }

  const sanitized = raw.replace(/[^\d,.-]/g, "").replace(/\s+/g, "");
  if (!sanitized) {
    return null;
  }

  const normalized =
    sanitized.includes(".") && sanitized.includes(",")
      ? sanitized.replace(/,/g, "")
      : sanitized.replace(/,/g, ".");

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatMoneyValue(input) {
  const value = typeof input === "number" ? input : parseMoneyValue(input);
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  return value.toFixed(2);
}

function getSuggestedRetailMultiplier(cost) {
  if (!Number.isFinite(cost) || cost <= 0) {
    return null;
  }

  if (cost < 5) {
    return 4;
  }

  if (cost < 15) {
    return 3;
  }

  if (cost < 30) {
    return 2.5;
  }

  return 2;
}

function suggestRetailPriceFromCost(cost) {
  const multiplier = getSuggestedRetailMultiplier(cost);
  if (!multiplier) {
    return "";
  }

  const raw = cost * multiplier;
  if (!Number.isFinite(raw) || raw <= 0) {
    return "";
  }

  return (Math.max(0.99, Math.round(raw) - 0.01)).toFixed(2);
}

export function toShopifyGid(typeOrValue, maybeValue) {
  const type = maybeValue === undefined ? "Product" : normalizePlainText(typeOrValue) || "Product";
  const value = maybeValue === undefined ? typeOrValue : maybeValue;

  const text = normalizePlainText(value);
  if (!text) {
    return "";
  }

  if (/^gid:\/\/shopify\/[a-z0-9_]+\/\d+$/i.test(text)) {
    return text;
  }

  const numeric = text.match(/\d+/)?.[0] || "";
  if (!numeric) {
    return "";
  }

  return `gid://shopify/${type}/${numeric}`;
}

function getRowValue(row, candidates) {
  const entries = Object.entries(row || {});
  const lookup = new Map(entries.map(([key, value]) => [normalizeKey(key), value]));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    if (lookup.has(normalizedCandidate)) {
      return lookup.get(normalizedCandidate);
    }
  }

  return "";
}

function splitTags(input) {
  const raw = normalizePlainText(input);
  if (!raw) {
    return [];
  }

  const values = raw
    .split(/[,\n;|]+/g)
    .map((entry) => normalizePlainText(entry))
    .filter(Boolean);

  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  return result;
}

function buildVariantPlanFromRow(row) {
  const variantId = toShopifyGid("ProductVariant", getRowValue(row, ["Variant ID", "ID"]));
  const sku = normalizePlainText(getRowValue(row, ["Variant SKU"]));
  const optionValues = [
    normalizePlainText(getRowValue(row, ["Option1 Value"])),
    normalizePlainText(getRowValue(row, ["Option2 Value"])),
    normalizePlainText(getRowValue(row, ["Option3 Value"])),
  ].filter(Boolean);
  const label =
    optionValues.join(" / ") ||
    normalizePlainText(firstNonEmpty(getRowValue(row, ["Variant Title"]), sku, getRowValue(row, ["Title"])));
  const sourceCost = formatMoneyValue(getRowValue(row, ["Cost per item"]));
  const explicitPrice = formatMoneyValue(firstNonEmpty(getRowValue(row, ["Variant Price"]), getRowValue(row, ["Price / International"])));
  const price = explicitPrice || suggestRetailPriceFromCost(Number(sourceCost));
  const compareAtPrice = formatMoneyValue(
    firstNonEmpty(getRowValue(row, ["Variant Compare At Price"]), getRowValue(row, ["Compare At Price / International"])),
  );

  if (!variantId && !sku && !label && !price && !compareAtPrice) {
    return null;
  }

  return {
    variantId,
    sku,
    label,
    optionValues,
    price,
    compareAtPrice,
    sourceCost,
  };
}

function buildMediaPlanFromRow(row) {
  const imageSrc = normalizeUrlForMatch(getRowValue(row, ["Image Src"]));
  const alt = normalizePlainText(getRowValue(row, ["Image Alt Text"]));

  if (!imageSrc || !alt) {
    return null;
  }

  return {
    imageSrc,
    alt,
  };
}

function createBlankProductPlan(handle) {
  return {
    handle,
    productId: "",
    productInput: {
      title: "",
      descriptionHtml: "",
      productType: "",
      tags: [],
      seo: {
        title: "",
        description: "",
      },
    },
    variantUpdates: [],
    mediaTargets: [],
    categoryQuery: "",
    categoryId: "",
  };
}

function dedupeArrayByKey(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function mergeProductInput(target, row) {
  const title = normalizePlainText(getRowValue(row, ["Title"]));
  const descriptionHtml = normalizeHtmlValue(getRowValue(row, ["Body (HTML)"]));
  const productType = normalizePlainText(firstNonEmpty(getRowValue(row, ["Type"]), getRowValue(row, ["Product Type"])));
  const tags = splitTags(getRowValue(row, ["Tags"]));
  const seoTitle = normalizePlainText(getRowValue(row, ["SEO Title"]));
  const seoDescription = normalizePlainText(getRowValue(row, ["SEO Description"]));
  const productId = toShopifyGid("Product", firstNonEmpty(getRowValue(row, ["Product ID"]), getRowValue(row, ["ID"])));
  const categoryQuery = normalizePlainText(
    firstNonEmpty(
      getRowValue(row, ["Google Shopping / Google Product Category"]),
      getRowValue(row, ["Google Shopping Category"]),
      getRowValue(row, ["Product Category"]),
    ),
  );

  if (title && !target.productInput.title) {
    target.productInput.title = title;
  }

  if (descriptionHtml && !target.productInput.descriptionHtml) {
    target.productInput.descriptionHtml = descriptionHtml;
  }

  if (productType && !target.productInput.productType) {
    target.productInput.productType = productType;
  }

  if (tags.length && !target.productInput.tags.length) {
    target.productInput.tags = tags;
  }

  if (seoTitle && !target.productInput.seo.title) {
    target.productInput.seo.title = seoTitle;
  }

  if (seoDescription && !target.productInput.seo.description) {
    target.productInput.seo.description = seoDescription;
  }

  if (productId && !target.productId) {
    target.productId = productId;
  }

  if (categoryQuery && !target.categoryQuery) {
    target.categoryQuery = categoryQuery;
  }
}

export async function buildSeoBatchPlan(rows, { resolveCategoryId, suppressCategoryWarnings } = {}) {
  const groups = new Map();
  const warnings = [];
  const resolveCategory =
    typeof resolveCategoryId === "function"
      ? resolveCategoryId
      : async () => null;

  rows.forEach((row, rowIndex) => {
    const handle = normalizeHandleValue(getRowValue(row, ["Handle"]));
    if (!handle) {
      warnings.push(`Row ${rowIndex + 1} is missing a handle and was skipped.`);
      return;
    }

    const productPlan = groups.get(handle) || createBlankProductPlan(handle);
    mergeProductInput(productPlan, row);

    const variantPlan = buildVariantPlanFromRow(row);
    if (variantPlan) {
      productPlan.variantUpdates.push(variantPlan);
    }

    const mediaPlan = buildMediaPlanFromRow(row);
    if (mediaPlan) {
      productPlan.mediaTargets.push(mediaPlan);
    }

    groups.set(handle, productPlan);
  });

  const products = [];
  for (const productPlan of groups.values()) {
    productPlan.variantUpdates = dedupeArrayByKey(productPlan.variantUpdates, (entry) => {
      return [
        entry.variantId || "",
        entry.sku || "",
        entry.label || "",
        entry.price || "",
        entry.compareAtPrice || "",
      ].join("|");
    });

    productPlan.mediaTargets = dedupeArrayByKey(productPlan.mediaTargets, (entry) => entry.imageSrc);

    if (productPlan.categoryQuery) {
      productPlan.categoryId = await resolveCategory(productPlan.categoryQuery);
      if (!productPlan.categoryId && !suppressCategoryWarnings) {
        warnings.push(`Could not resolve category "${productPlan.categoryQuery}" for ${productPlan.handle}.`);
      }
    }

    products.push(productPlan);
  }

  return {
    products,
    warnings,
  };
}

export function buildMediaUpdateTargets(mediaNodes, mediaTargets) {
  const liveMedia = Array.isArray(mediaNodes) ? mediaNodes : [];
  const plannedTargets = Array.isArray(mediaTargets) ? mediaTargets : [];
  const liveLookup = liveMedia
    .map((node) => {
      const imageUrl = normalizeUrlForMatch(node?.image?.url);
      return imageUrl ? { node, imageUrl } : null;
    })
    .filter(Boolean);

  const updates = [];
  for (const target of plannedTargets) {
    const imageSrc = normalizeUrlForMatch(target?.imageSrc);
    const alt = normalizePlainText(target?.alt);
    if (!imageSrc || !alt) {
      continue;
    }

    const match = liveLookup.find((entry) => entry.imageUrl === imageSrc);
    if (!match?.node?.id) {
      continue;
    }

    updates.push({
      id: match.node.id,
      alt,
    });
  }

  return dedupeArrayByKey(updates, (entry) => entry.id);
}
