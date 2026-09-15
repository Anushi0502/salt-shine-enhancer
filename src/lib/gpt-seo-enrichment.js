import { classifyProductKnowledge } from "./product-knowledge-base.js";

export const GPT_SEO_RECORD_SCHEMA_VERSION = 2;

const GENERIC_PATTERNS = [
  /serves the specific function identified/i,
  /identified by the product title/i,
  /confirmed product facts/i,
  /shoppers looking for the specific product type/i,
  /use it only for the stated task/i,
  /available options help shoppers compare/i,
  /everyday value/i,
];

const INCOMPATIBLE_FAMILY_RULES = [
  { phrase: /\bphone\s+case\b/i, evidence: /\b(?:phone|iphone|samsung|pixel)\b/i },
  { phrase: /\bearbuds?\s+case\b/i, evidence: /\b(?:earbuds?|airpods?|earphones?)\b/i },
  { phrase: /\b(?:pet|dog|cat)\s+(?:supplies|toy|grooming|feeding|travel)\b/i, evidence: /\b(?:pet|dog|cat|puppy|kitten)\b/i },
  { phrase: /\bmakeup\b|\bcosmetic/i, evidence: /\b(?:makeup|cosmetic|lipstick|mascara|blush|eyeliner|beauty)\b/i },
  { phrase: /\b(?:wig|hair\s+extension|human\s+hair)\b/i, evidence: /\b(?:wig|hair\s+extension|human\s+hair|lace\s+front|weave|toupee)\b/i },
];

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return text(value)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|nbsp|lt|gt|quot|#39);/gi, " ");
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokens(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !/^\d+$/.test(token)),
  );
}

function normalizeList(value, limit = 10, maxLength = 120) {
  return Array.isArray(value)
    ? value.map((entry) => text(entry).slice(0, maxLength)).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeTypeAttributes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, rawValue]) => {
        const normalizedKey = text(key).slice(0, 64);
        const values = Array.isArray(rawValue)
          ? normalizeList(rawValue, 6, 100)
          : [text(rawValue).slice(0, 100)].filter(Boolean);
        return [normalizedKey, values];
      })
      .filter(([key, values]) => key && values.length)
      .slice(0, 8),
  );
}

function normalizeCategory(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    department: text(source.department || source.departmentLabel),
    category: text(source.category || source.categoryLabel || (typeof value === "string" ? value : "")),
    subcategory: text(source.subcategory || source.subcategoryLabel),
    productType: text(source.productType || source.canonicalType || source.leafType),
  };
}

export function verifiedProductTaxonomy(product) {
  try {
    const knowledge = classifyProductKnowledge(product);
    return {
      department: text(knowledge.departmentLabel || knowledge.familyLabel),
      category: text(knowledge.categoryLabel || knowledge.departmentLabel || knowledge.familyLabel),
      subcategory: text(knowledge.subcategoryLabel || knowledge.canonicalType || knowledge.leafType),
      productType: text(knowledge.canonicalType || knowledge.specificType || product?.productType || product?.product_type),
      departmentId: text(knowledge.departmentId),
      categoryId: text(knowledge.categoryId),
      subcategoryId: text(knowledge.subcategoryId),
      canonicalTypeId: text(knowledge.canonicalTypeId),
      shopifyCategory: text(knowledge.shopifyCategory),
      attributes: knowledge.attributes && typeof knowledge.attributes === "object" ? knowledge.attributes : {},
    };
  } catch {
    const productType = text(product?.productType || product?.product_type);
    return {
      department: "",
      category: "",
      subcategory: productType,
      productType,
      departmentId: "",
      categoryId: "",
      subcategoryId: "",
      canonicalTypeId: "",
      shopifyCategory: "",
      attributes: {},
    };
  }
}

export function productGptEvidence(product) {
  const variants = Array.isArray(product?.variants?.nodes)
    ? product.variants.nodes
    : Array.isArray(product?.variants)
      ? product.variants
      : [];
  const taxonomy = verifiedProductTaxonomy(product);
  return {
    handle: text(product?.handle),
    title: text(product?.title),
    productType: text(product?.productType || product?.product_type),
    vendor: text(product?.vendor),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
    sourceDescription: stripHtml(product?.descriptionHtml || product?.body_html).slice(0, 4500),
    verifiedTaxonomy: {
      department: taxonomy.department,
      category: taxonomy.category,
      subcategory: taxonomy.subcategory,
      productType: taxonomy.productType,
      shopifyCategory: taxonomy.shopifyCategory,
    },
    evidencedTypeAttributes: taxonomy.attributes,
    variants: variants.slice(0, 80).map((variant) => ({
      title: text(variant?.title),
      sku: text(variant?.sku),
      selectedOptions: Array.isArray(variant?.selectedOptions)
        ? variant.selectedOptions.map((option) => `${text(option?.name)}: ${text(option?.value)}`).filter(Boolean)
        : [],
    })),
  };
}

export function buildGptSeoPrompt(product) {
  const evidence = productGptEvidence(product);
  return [
    "Create product-specific ecommerce SEO copy from the supplied evidence only.",
    "Do not invent materials, dimensions, compatibility, warranty, safety, health, shipping, certifications, or benefits.",
    "Do not change the product family. A case for earbuds is not a phone case. Preserve observed model, size, color, quantity, and variant distinctions.",
    "Return JSON only with exactly these keys: title, descriptionHtml, seoTitle, seoDescription, category, metafields, searchTerms.",
    "title must be <= 75 characters; seoTitle <= 70 characters; seoDescription must be 120-170 characters.",
    "descriptionHtml may use only h2, h3, p, ul, li, strong, and ol tags. Include useful details only when evidenced.",
    "Avoid generic filler such as 'specific function', 'confirmed product facts', 'everyday value', or 'shoppers looking for'.",
    "searchTerms must be an array of 3-10 concise evidence-backed phrases.",
    "category must be an object with department, category, subcategory, and productType copied from verifiedTaxonomy; do not invent or broaden the category.",
    "metafields must be an object with badgeText, highlights, collectionSignal, and typeAttributes. Use 2-4 factual highlights, a concise collection signal, and only type attributes supported by the evidence.",
    "badgeText must be <= 32 characters; collectionSignal <= 120 characters; typeAttributes must be a small object of factual values, never unsupported claims.",
    "PRODUCT EVIDENCE:",
    JSON.stringify(evidence),
  ].join("\n");
}

export function normalizeGptSeoRecord(record, product = {}) {
  const source = record && typeof record === "object" ? record : {};
  return {
    schemaVersion: Number(source.schemaVersion) || GPT_SEO_RECORD_SCHEMA_VERSION,
    handle: normalizeKey(source.handle || product.handle),
    title: text(source.title),
    descriptionHtml: text(source.descriptionHtml || source.description_html),
    seoTitle: text(source.seoTitle || source.seo_title),
    seoDescription: text(source.seoDescription || source.seo_description),
    category: normalizeCategory(source.category || {
      department: source.department,
      category: source.categoryLabel,
      subcategory: source.subcategory,
      productType: source.productType,
    }),
    metafields: {
      badgeText: text(source.metafields?.badgeText || source.metafields?.badge_text).slice(0, 32),
      highlights: normalizeList(source.metafields?.highlights, 4, 120),
      collectionSignal: text(source.metafields?.collectionSignal || source.metafields?.collection_signal).slice(0, 120),
      typeAttributes: normalizeTypeAttributes(source.metafields?.typeAttributes || source.metafields?.type_attributes),
    },
    searchTerms: normalizeList(source.searchTerms || source.search_terms, 10, 120),
  };
}

export function validateGptSeoRecord(product, record) {
  const normalized = normalizeGptSeoRecord(record, product);
  const evidence = productGptEvidence(product);
  const evidenceText = [
    evidence.handle,
    evidence.title,
    evidence.productType,
    evidence.vendor,
    evidence.tags.join(" "),
    evidence.sourceDescription,
    evidence.variants.flatMap((variant) => [variant.title, variant.sku, ...variant.selectedOptions]).join(" "),
  ].join(" ");
  const outputText = [
    normalized.title,
    normalized.descriptionHtml,
    normalized.seoTitle,
    normalized.seoDescription,
    Object.values(normalized.category).join(" "),
    normalized.metafields.badgeText,
    normalized.metafields.highlights.join(" "),
    normalized.metafields.collectionSignal,
    normalized.searchTerms.join(" "),
  ].join(" ");
  const evidenceTokens = tokens(evidenceText);
  const outputTokens = tokens(outputText);
  const matchedTokens = [...evidenceTokens].filter((token) => outputTokens.has(token));
  const issues = [];
  if (!normalized.handle) issues.push("missing-handle");
  if (!normalized.title || normalized.title.length > 75) issues.push("invalid-title");
  if (!normalized.seoTitle || normalized.seoTitle.length > 70) issues.push("invalid-seo-title");
  if (!normalized.seoDescription || normalized.seoDescription.length < 120 || normalized.seoDescription.length > 170) issues.push("invalid-seo-description");
  if (!normalized.descriptionHtml) issues.push("missing-description");
  if (normalized.searchTerms.length < 3) issues.push("invalid-search-terms");
  for (const field of ["department", "category", "subcategory", "productType"]) {
    const expected = text(evidence.verifiedTaxonomy?.[field]);
    const actual = text(normalized.category?.[field]);
    if (expected && !actual) issues.push(`missing-category:${field}`);
    else if (expected && normalizeKey(actual) !== normalizeKey(expected)) issues.push(`category-mismatch:${field}`);
  }
  if (!normalized.metafields || normalized.metafields.highlights.length < 2) issues.push("invalid-highlights");
  if (!normalized.metafields?.collectionSignal) issues.push("missing-collection-signal");
  const typeAttributeEvidence = [
    evidenceText,
    JSON.stringify(evidence.evidencedTypeAttributes || {}),
  ].join(" ");
  const typeAttributeTokens = tokens(typeAttributeEvidence);
  for (const [key, values] of Object.entries(normalized.metafields?.typeAttributes || {})) {
    for (const value of values) {
      const valueTokens = [...tokens(value)];
      if (valueTokens.length && !valueTokens.some((token) => typeAttributeTokens.has(token))) {
        issues.push(`unsupported-type-attribute:${normalizeKey(key)}`);
      }
    }
  }
  if (matchedTokens.length < 2) issues.push("insufficient-evidence-overlap");
  if (GENERIC_PATTERNS.some((pattern) => pattern.test(outputText))) issues.push("generic-copy");
  for (const rule of INCOMPATIBLE_FAMILY_RULES) {
    if (rule.phrase.test(outputText) && !rule.evidence.test(evidenceText)) issues.push(`unsupported-family:${rule.phrase}`);
  }
  for (const match of normalized.descriptionHtml.matchAll(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi)) {
    if (!["h2", "h3", "p", "ul", "li", "strong", "ol"].includes(match[1].toLowerCase())) {
      issues.push(`unsupported-html:${match[1].toLowerCase()}`);
    }
  }
  return {
    accepted: issues.length === 0,
    issues,
    matchedEvidenceTokens: matchedTokens.slice(0, 24),
    record: normalized,
  };
}

export function mergeGptSeoIntoPlan(plan, enrichment, { scope = "all-products" } = {}) {
  const records = Array.isArray(enrichment?.records) ? enrichment.records : [];
  const byHandle = new Map(records.filter((record) => record?.accepted !== false).map((record) => [normalizeKey(record.handle), record.record || record]));
  let applied = 0;
  const products = (Array.isArray(plan?.products) ? plan.products : []).map((product) => {
    const record = byHandle.get(normalizeKey(product?.handle));
    if (!record) return product;
    const desired = product.desiredProductInput || {};
    const desiredSeo = desired.seo || {};
    applied += 1;
    return {
      ...product,
      desiredProductInput: {
        ...desired,
        ...(record.title ? { title: record.title } : {}),
        ...(record.descriptionHtml ? { descriptionHtml: record.descriptionHtml } : {}),
        seo: {
          ...desiredSeo,
          ...(record.seoTitle ? { title: record.seoTitle } : {}),
          ...(record.seoDescription ? { description: record.seoDescription } : {}),
        },
      },
      gptSeo: {
        model: enrichment.model || "",
        scope,
        evidenceFingerprint: record.evidenceFingerprint || "",
        accepted: true,
        category: record.category || {},
        metafields: record.metafields || {},
        searchTerms: record.searchTerms || [],
      },
    };
  });
  return {
    ...plan,
    products,
    gptSeo: {
      model: enrichment.model || "",
      scope,
      records: records.length,
      applied,
    },
  };
}

export { normalizeKey, stripHtml };
