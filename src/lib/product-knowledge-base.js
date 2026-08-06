import {
  CATALOG_TAXONOMY_VERSION,
  classifyCatalogTaxonomy,
  normalizeCatalogText,
  singularizeCatalogToken,
  tokenizeCatalogText,
} from "./catalog-taxonomy.js";

export const PRODUCT_KNOWLEDGE_BASE_VERSION = CATALOG_TAXONOMY_VERSION;

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
  "our", "your", "new", "best", "sale", "shop", "product", "products", "item", "items", "set", "sets",
]);

const GENERIC_TOKENS = new Set([
  ...STOP_WORDS,
  "daily", "everyday", "premium", "quality", "fashion", "style", "stylish", "modern", "portable", "small",
  "large", "mini", "new", "latest", "unisex", "women", "woman", "men", "man", "kids", "child", "children",
]);

const GENERIC_PRODUCT_TYPES = new Set([
  "accessory", "accessories", "beauty", "clothing", "fashion", "item", "items", "product", "products",
  "shopify product", "unclassified product",
]);

const PRODUCT_KNOWLEDGE_CACHE = new WeakMap();

function asText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  return value == null ? "" : String(value);
}

export function normalizeKnowledgeText(value) {
  return normalizeCatalogText(asText(value));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenize(value) {
  return unique(tokenizeCatalogText(value));
}

function slugify(value) {
  return normalizeKnowledgeText(value).replace(/\s+/g, "-").slice(0, 120);
}

function canonicalLeafType(product, taxonomy) {
  const explicitType = normalizeKnowledgeText(product?.product_type || product?.productType);
  if (taxonomy.ruleId === "unclassified" && explicitType) {
    return explicitType;
  }
  return normalizeKnowledgeText(taxonomy.canonicalType) || explicitType || "unclassified product";
}

function productKnowledgeId(product) {
  const id = String(product?.id || "").trim();
  const handle = slugify(product?.handle || "");
  return id ? `product:${id}` : handle ? `handle:${handle}` : "product:unknown";
}

function specificProductType(product, taxonomy) {
  const explicitType = normalizeKnowledgeText(product?.product_type || product?.productType);
  if (explicitType && !GENERIC_PRODUCT_TYPES.has(explicitType)) {
    return explicitType;
  }

  const sourceTokens = tokenize(product?.title)
    .map(singularizeCatalogToken)
    .filter((token) => token.length >= 2 && !GENERIC_TOKENS.has(token));
  const descriptor = unique(sourceTokens).slice(0, 12).join(" ");
  return descriptor || normalizeKnowledgeText(taxonomy.canonicalType) || "unclassified product";
}

function specificProductTypeKey(product, specificType, fallbackTypeKey) {
  const descriptor = slugify(specificType) || fallbackTypeKey;
  const numericId = String(product?.id || "").replace(/\D+/g, "");
  const handle = slugify(product?.handle || "");
  // The descriptor is useful for analysis, while the stable product suffix
  // prevents two records in the same Shopify product type from collapsing.
  const identity = numericId ? `product-${numericId}` : handle ? `handle-${handle}` : "product-unknown";
  return `${descriptor.slice(0, 96)}--${identity}`.slice(0, 220);
}

function buildAliases(product, taxonomy, leafType) {
  const relatedCategoryAliases = (taxonomy.relatedCategories || []).flatMap((category) => [
    category.categoryLabel,
    category.subcategoryLabel,
  ]);
  const sourceAliases = [
    taxonomy.canonicalType,
    taxonomy.subcategoryLabel,
    leafType,
    ...relatedCategoryAliases,
    ...(taxonomy.aliases || []),
  ];

  // Importer tags are deliberately not copied into knowledge aliases. They
  // remain searchable as raw product tags, but bad supplier tags cannot make a
  // product look like a different category in predictive search.
  return unique([
    ...sourceAliases.map(normalizeKnowledgeText),
    ...sourceAliases.flatMap((entry) => tokenize(entry).map(singularizeCatalogToken)),
  ])
    .filter((value) => value.length >= 2)
    .slice(0, 32);
}

function buildSearchTerms(product, taxonomy, leafType, aliases) {
  return unique([
    ...tokenize(product?.title),
    ...tokenize(product?.handle),
    ...tokenize(leafType),
    ...tokenize(taxonomy.canonicalType),
    ...tokenize(taxonomy.subcategoryLabel),
    ...(taxonomy.relatedCategories || []).flatMap((category) => [
      ...tokenize(category.categoryLabel),
      ...tokenize(category.subcategoryLabel),
    ]),
    ...aliases.flatMap(tokenize),
  ])
    .map(singularizeCatalogToken)
    .filter((token) => !GENERIC_TOKENS.has(token))
    .slice(0, 88);
}

function buildFallbackSearchTerms(product, leafType) {
  return unique([
    ...tokenize(product?.title),
    ...tokenize(product?.handle),
    ...tokenize(leafType),
  ])
    .map(singularizeCatalogToken)
    .filter((token) => !GENERIC_TOKENS.has(token))
    .slice(0, 40);
}

export function classifyProductKnowledge(product) {
  if (product && typeof product === "object") {
    const cached = PRODUCT_KNOWLEDGE_CACHE.get(product);
    if (cached) return cached;
  }

  const taxonomy = classifyCatalogTaxonomy(product);
  const knowledge = buildProductKnowledgeFromTaxonomy(product, taxonomy);

  if (product && typeof product === "object") {
    PRODUCT_KNOWLEDGE_CACHE.set(product, knowledge);
  }

  return knowledge;
}

export function buildProductKnowledgeFromTaxonomy(product, taxonomy) {
  if (!taxonomy?.ruleId) throw new Error("A taxonomy classification is required to build product knowledge.");
  const leafType = canonicalLeafType(product, taxonomy);
  const specificType = specificProductType(product, taxonomy);
  const typeKey = slugify(leafType) || "unclassified-product";
  const specificTypeKey = specificProductTypeKey(product, specificType, typeKey);
  const aliases = taxonomy.ruleId === "unclassified"
    ? [leafType]
    : buildAliases(product, taxonomy, leafType);
  const searchTerms = taxonomy.ruleId === "unclassified"
    ? buildFallbackSearchTerms(product, leafType)
    : buildSearchTerms(product, taxonomy, leafType, aliases);
  return {
    version: PRODUCT_KNOWLEDGE_BASE_VERSION,
    productKnowledgeId: productKnowledgeId(product),
    typeKey,
    leafType,
    specificType,
    specificTypeKey,
    familyId: taxonomy.familyId,
    familyLabel: taxonomy.familyLabel,
    taxonomyPath: [
      taxonomy.departmentId,
      taxonomy.categoryId,
      taxonomy.subcategoryId,
      taxonomy.canonicalTypeId,
    ],
    departmentId: taxonomy.departmentId,
    departmentLabel: taxonomy.departmentLabel,
    categoryId: taxonomy.categoryId,
    categoryLabel: taxonomy.categoryLabel,
    subcategoryId: taxonomy.subcategoryId,
    subcategoryLabel: taxonomy.subcategoryLabel,
    relatedCategories: taxonomy.relatedCategories,
    canonicalTypeId: taxonomy.canonicalTypeId,
    canonicalType: taxonomy.canonicalType,
    classificationRule: taxonomy.ruleId,
    audience: taxonomy.audience,
    aliases,
    searchTerms,
    negativeTerms: taxonomy.negativeTerms,
    attributes: taxonomy.attributes,
    proposedTags: taxonomy.proposedTags,
    collectionTargets: taxonomy.collectionTargets,
    shopifyCategory: taxonomy.shopifyCategory,
    confidence: taxonomy.confidence,
    reviewRequired: taxonomy.reviewRequired,
    reviewReasons: taxonomy.reviewReasons,
    seoEligible: taxonomy.seoEligible,
    evidence: taxonomy.evidence,
  };
}

export function compactProductKnowledge(productKnowledge) {
  if (!productKnowledge) return null;
  return {
    version: productKnowledge.version,
    productKnowledgeId: productKnowledge.productKnowledgeId,
    typeKey: productKnowledge.typeKey,
    leafType: productKnowledge.leafType,
    specificType: productKnowledge.specificType,
    specificTypeKey: productKnowledge.specificTypeKey,
    familyId: productKnowledge.familyId,
    familyLabel: productKnowledge.familyLabel,
    taxonomyPath: productKnowledge.taxonomyPath,
    departmentId: productKnowledge.departmentId,
    departmentLabel: productKnowledge.departmentLabel,
    categoryId: productKnowledge.categoryId,
    categoryLabel: productKnowledge.categoryLabel,
    subcategoryId: productKnowledge.subcategoryId,
    subcategoryLabel: productKnowledge.subcategoryLabel,
    relatedCategories: productKnowledge.relatedCategories,
    canonicalTypeId: productKnowledge.canonicalTypeId,
    classificationRule: productKnowledge.classificationRule,
    audience: productKnowledge.audience,
    aliases: productKnowledge.aliases.slice(0, 8),
    searchTerms: productKnowledge.searchTerms.slice(0, 40),
    negativeTerms: productKnowledge.negativeTerms.slice(0, 8),
    attributes: Object.fromEntries(
      Object.entries(productKnowledge.attributes || {}).map(([group, values]) => [group, values.slice(0, 4)]),
    ),
    confidence: productKnowledge.confidence,
    reviewRequired: productKnowledge.reviewRequired,
  };
}

export function buildProductKnowledgePayload(productsPayload) {
  const products = Array.isArray(productsPayload?.products) ? productsPayload.products : [];
  const typeMap = new Map();
  const familyMap = new Map();
  const departmentMap = new Map();
  const categoryMap = new Map();
  const records = products
    .map((product) => {
      const knowledge = classifyProductKnowledge(product);
      if (!typeMap.has(knowledge.typeKey)) {
        typeMap.set(knowledge.typeKey, {
          typeKey: knowledge.typeKey,
          leafType: knowledge.leafType,
          familyId: knowledge.familyId,
          familyLabel: knowledge.familyLabel,
          taxonomyPath: knowledge.taxonomyPath,
          departmentId: knowledge.departmentId,
          categoryId: knowledge.categoryId,
          subcategoryId: knowledge.subcategoryId,
          relatedCategories: knowledge.relatedCategories,
          canonicalTypeId: knowledge.canonicalTypeId,
          aliases: knowledge.aliases,
        });
      }
      familyMap.set(knowledge.familyId, { id: knowledge.familyId, label: knowledge.familyLabel });
      departmentMap.set(knowledge.departmentId, { id: knowledge.departmentId, label: knowledge.departmentLabel });
      categoryMap.set(knowledge.categoryId, { id: knowledge.categoryId, label: knowledge.categoryLabel });
      for (const related of knowledge.relatedCategories || []) {
        departmentMap.set(related.departmentId, { id: related.departmentId, label: related.departmentLabel });
        categoryMap.set(related.categoryId, { id: related.categoryId, label: related.categoryLabel });
      }
      return {
        id: Number(product?.id) || 0,
        handle: String(product?.handle || "").trim(),
        productKnowledgeId: knowledge.productKnowledgeId,
        typeKey: knowledge.typeKey,
        specificType: knowledge.specificType,
        specificTypeKey: knowledge.specificTypeKey,
        familyId: knowledge.familyId,
        departmentId: knowledge.departmentId,
        categoryId: knowledge.categoryId,
        subcategoryId: knowledge.subcategoryId,
        relatedCategories: knowledge.relatedCategories,
        canonicalTypeId: knowledge.canonicalTypeId,
        classificationRule: knowledge.classificationRule,
        confidence: knowledge.confidence,
        reviewRequired: knowledge.reviewRequired,
        reviewReasons: knowledge.reviewReasons,
        seoEligible: knowledge.seoEligible,
        attributes: knowledge.attributes,
        proposedTags: knowledge.proposedTags,
        collectionTargets: knowledge.collectionTargets,
        searchTerms: knowledge.searchTerms,
        negativeTerms: knowledge.negativeTerms,
      };
    })
    .filter((record) => record.id && record.handle);

  return {
    version: PRODUCT_KNOWLEDGE_BASE_VERSION,
    generatedAt: productsPayload?.generatedAt || new Date().toISOString(),
    source: productsPayload?.source || "/data/products.json",
    totalProducts: records.length,
    uniqueProductKnowledgeRecords: records.length,
    uniqueProductTypes: typeMap.size,
    families: [...familyMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    departments: [...departmentMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    categories: [...categoryMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    types: [...typeMap.values()].sort((left, right) => left.typeKey.localeCompare(right.typeKey)),
    products: records,
  };
}
