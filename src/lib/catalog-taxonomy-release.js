import { CATALOG_TAG_PREFIX, CATALOG_TAXONOMY_VERSION } from "./catalog-taxonomy.js";
import { classifyProductKnowledge } from "./product-knowledge-base.js";

export const TAXONOMY_METAFIELD_NAMESPACE = "salt_taxonomy";
export const TAXONOMY_METAFIELD_KEY = "classification";
export const TAXONOMY_METAFIELD_TYPE = "json";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeTaxonomyTag(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeCatalogHandle(value) {
  return normalizeText(value).toLowerCase();
}

export function isOnlineStorePublishedLiveProduct(product) {
  if (normalizeText(product?.status).toUpperCase() !== "ACTIVE") {
    return false;
  }

  if (typeof product?.onlineStorePublished === "boolean") {
    return product.onlineStorePublished;
  }

  const publications = asArray(product?.resourcePublications?.nodes);
  if (publications.length) {
    return publications.some(
      (publication) =>
        publication?.isPublished === true && normalizeText(publication?.channel?.name).toLowerCase() === "online store",
    );
  }

  // This fallback only supports legacy REST/public-feed records. Live apply
  // always supplies explicit publication data and therefore fails closed above.
  return Boolean(product?.publishedAt || product?.published_at);
}

export function isActiveShopifyProduct(product) {
  return normalizeText(product?.status).toUpperCase() === "ACTIVE";
}

export function buildManagedTagAdditions(existingTags, proposedTags) {
  const current = new Set(asArray(existingTags).map(normalizeTaxonomyTag).filter(Boolean));
  const additions = [];

  for (const tag of asArray(proposedTags).map(normalizeText).filter(Boolean)) {
    if (!tag.startsWith(`${CATALOG_TAG_PREFIX}:`)) {
      throw new Error(`Managed taxonomy tag is outside the ${CATALOG_TAG_PREFIX}: namespace: ${tag}`);
    }

    const normalized = normalizeTaxonomyTag(tag);
    if (current.has(normalized)) {
      continue;
    }

    current.add(normalized);
    additions.push(tag);
  }

  return additions;
}

export function buildTaxonomyMetafieldValue(product, knowledge = classifyProductKnowledge(product)) {
  return JSON.stringify({
    version: CATALOG_TAXONOMY_VERSION,
    productKnowledgeId: knowledge.productKnowledgeId,
    specificTypeKey: knowledge.specificTypeKey,
    specificType: knowledge.specificType,
    classificationRule: knowledge.classificationRule,
    confidence: knowledge.confidence,
    reviewRequired: Boolean(knowledge.reviewRequired),
    reviewReasons: asArray(knowledge.reviewReasons),
    tagApplication: knowledge.reviewRequired ? "withheld-pending-review" : "controlled-tags-approved",
    audience: knowledge.audience?.id || "",
    department: {
      id: knowledge.departmentId,
      label: knowledge.departmentLabel,
    },
    category: {
      id: knowledge.categoryId,
      label: knowledge.categoryLabel,
    },
    subcategory: {
      id: knowledge.subcategoryId,
      label: knowledge.subcategoryLabel,
    },
    relatedCategories: asArray(knowledge.relatedCategories).map((category) => ({
      department: {
        id: category.departmentId,
        label: category.departmentLabel,
      },
      category: {
        id: category.categoryId,
        label: category.categoryLabel,
      },
      subcategory: {
        id: category.subcategoryId,
        label: category.subcategoryLabel,
      },
      relationship: category.relationship,
      tagging: "additive-controlled-tag",
    })),
    canonicalType: {
      id: knowledge.canonicalTypeId,
      label: knowledge.canonicalType,
    },
    shopifyCategory: knowledge.shopifyCategory || "",
  });
}

export function buildTaxonomyMetafieldInput(ownerId, product, knowledge = classifyProductKnowledge(product)) {
  return {
    ownerId,
    namespace: TAXONOMY_METAFIELD_NAMESPACE,
    key: TAXONOMY_METAFIELD_KEY,
    type: TAXONOMY_METAFIELD_TYPE,
    value: buildTaxonomyMetafieldValue(product, knowledge),
  };
}

function getTaxonomyMetafield(product) {
  const entries = asArray(product?.metafields);
  const listedMetafield = entries.find(
    (entry) =>
      normalizeText(entry?.namespace) === TAXONOMY_METAFIELD_NAMESPACE &&
      normalizeText(entry?.key) === TAXONOMY_METAFIELD_KEY,
  );

  return listedMetafield || product?.taxonomyMetafield || null;
}

export function taxonomyMetafieldMatches(product, expectedMetafield) {
  return normalizeText(getTaxonomyMetafield(product)?.value) === normalizeText(expectedMetafield?.value);
}

export function buildCatalogTaxonomyReleasePlan(localProducts, liveProducts, {
  mutateTags = true,
  knowledgeByHandle = new Map(),
} = {}) {
  const liveByHandle = new Map(
    asArray(liveProducts)
      .map((product) => [normalizeCatalogHandle(product?.handle), product])
      .filter(([handle, product]) => Boolean(handle && product?.id)),
  );
  const tasks = [];
  const skipped = [];

  for (const product of asArray(localProducts)) {
    const handle = normalizeCatalogHandle(product?.handle);
    const liveProduct = liveByHandle.get(handle);

    if (!handle) {
      skipped.push({ productId: product?.id || null, handle: "", reason: "missing-handle" });
      continue;
    }

    if (!liveProduct) {
      skipped.push({ productId: product?.id || null, handle, reason: "not-in-live-active-catalog" });
      continue;
    }

    if (!isActiveShopifyProduct(liveProduct)) {
      skipped.push({ productId: product?.id || null, handle, reason: "not-active" });
      continue;
    }

    const suppliedKnowledge = knowledgeByHandle instanceof Map
      ? knowledgeByHandle.get(handle)
      : knowledgeByHandle?.[handle];
    const knowledge = suppliedKnowledge || classifyProductKnowledge(product);
    const tagsToAdd = mutateTags
      ? buildManagedTagAdditions(liveProduct.tags, knowledge.proposedTags)
      : [];
    const taxonomyMetafield = buildTaxonomyMetafieldInput(liveProduct.id, product, knowledge);
    tasks.push({
      productId: liveProduct.id,
      localProductId: product?.id || null,
      handle,
      title: normalizeText(product?.title),
      initialTags: asArray(liveProduct.tags).map(normalizeText).filter(Boolean),
      proposedTags: asArray(knowledge.proposedTags).map(normalizeText).filter(Boolean),
      tagsToAdd,
      mutateTags,
      taxonomyMetafield,
      metafieldNeedsUpdate: !taxonomyMetafieldMatches(liveProduct, taxonomyMetafield),
      knowledge: {
        productKnowledgeId: knowledge.productKnowledgeId,
        classificationRule: knowledge.classificationRule,
        confidence: knowledge.confidence,
        departmentId: knowledge.departmentId,
        categoryId: knowledge.categoryId,
        subcategoryId: knowledge.subcategoryId,
        relatedCategories: asArray(knowledge.relatedCategories),
        canonicalTypeId: knowledge.canonicalTypeId,
        reviewRequired: Boolean(knowledge.reviewRequired),
        reviewReasons: asArray(knowledge.reviewReasons),
      },
    });
  }

  return {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    policy: {
      existingTags: "preserve-exactly",
      managedTags: mutateTags
        ? `add-only ${CATALOG_TAG_PREFIX}: namespace`
        : "unchanged; exact collection integrity is authoritative",
      lowConfidenceTaxonomy: "classification metafield only; controlled category tags withheld pending review",
      productScope: "all active Shopify products",
      categoryMembership: mutateTags
        ? "controlled add-only salt:department and salt:category tags; no Shopify product category mutation"
        : "no tag mutation; exact collection integrity is authoritative",
      publicationMutation: "none",
      priceMutation: "none",
      variantMutation: "none",
    },
    summary: {
      localProducts: asArray(localProducts).length,
      liveActiveProducts: asArray(liveProducts).filter(isActiveShopifyProduct).length,
      ready: tasks.length,
      reviewMarked: tasks.filter((task) => task.knowledge.reviewRequired).length,
      tagsToAdd: tasks.reduce((count, task) => count + task.tagsToAdd.length, 0),
      metafieldsToSet: tasks.filter((task) => task.metafieldNeedsUpdate).length,
      skipped: skipped.length,
    },
    tasks,
    skipped,
  };
}

export function verifyTaxonomyTaskReadback(task, liveProduct) {
  const actualTags = new Set(asArray(liveProduct?.tags).map(normalizeTaxonomyTag).filter(Boolean));
  const missingExistingTags = asArray(task?.initialTags)
    .filter((tag) => !actualTags.has(normalizeTaxonomyTag(tag)));
  const missingManagedTags = asArray(task?.tagsToAdd)
    .filter((tag) => !actualTags.has(normalizeTaxonomyTag(tag)));
  const metafieldMatches = taxonomyMetafieldMatches(liveProduct, task?.taxonomyMetafield);

  return {
    ok: !missingExistingTags.length && !missingManagedTags.length && metafieldMatches,
    missingExistingTags,
    missingManagedTags,
    metafieldMatches,
  };
}
