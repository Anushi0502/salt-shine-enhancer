#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import {
  buildDesiredFingerprint,
  buildReleaseFingerprint,
  buildLiveFingerprint,
  compareLiveProductToPlan,
} from "../src/lib/shopify-seo-release.js";
import { managedMinimumQuantityTagFromTags } from "../src/lib/shopify-seo-managed-tags.js";
import { classifyCatalogTaxonomy } from "../src/lib/catalog-taxonomy.js";
import { getCatalogTaxonomyOverride } from "../src/lib/catalog-taxonomy-overrides.js";

const livePath = "/tmp/salt-gsc-semantic-repair-fresh-live.json";
const jsonPath = "output/salt-gsc-semantic-repair-seo-plan-2026-09-14.json";
const markdownPath = "output/salt-gsc-semantic-repair-seo-plan-2026-09-14.md";
const liveEvidencePath = "output/salt-gsc-semantic-repair-fresh-live-2026-09-14.json";

const SPECS = Object.freeze({
  "2021-new-watch-women-watches-set-top-brand-luxury-gold-waterproof-quartz-wrist-watch-ladies-clock-fashion-simple-women-relogio": {
    title: "Women's Gold Quartz Wristwatch – Waterproof",
    noun: "watch",
    facts: ["Women’s watch", "Quartz movement", "Gold-tone finish", "Waterproof design"],
  },
  "lige-new-2026-top-elegant-womens-watches-fashion-simple-ladies-watches-quartz-waterproof-watches-for-women-relogio-feminino-box": {
    title: "LIGE Women's Quartz Wristwatch – Waterproof",
    noun: "watch",
    facts: ["Women’s watch", "Quartz movement", "Waterproof design", "Gift-box option listed"],
  },
  "lige-2024-new-fashion-women-watches-ladies-top-brand-luxury-creative-steel-women-bracelet-watches-female-quartz-waterproof-watch": {
    title: "LIGE Women's Steel Bracelet Quartz Watch – Waterproof",
    noun: "watch",
    facts: ["Women’s watch", "Quartz movement", "Steel bracelet", "Waterproof design"],
  },
  "megir-ladies-watch-chronograph-quartz-watches-women-top-brand-luxury-rose-gold-wristwatch-relogio-feminino-часы-женские-2057": {
    title: "MEGIR Women's Rose Gold Quartz Chronograph Watch",
    noun: "watch",
    facts: ["Women’s watch", "Quartz chronograph", "Rose-gold finish", "Gift-box option listed"],
  },
  "women-watches-top-brand-luxury-wristwatches-ladies-fashion-gold-bracelet-watch-female-elegant-clock-women-montre-femme": {
    title: "Women's Gold Bracelet Watch",
    noun: "watch",
    facts: ["Women’s watch", "Gold bracelet design", "Quartz wristwatch format"],
  },
  "luxury-watch-for-women-black-leather-oval-waterproof-exquisite-quartz-handwatch-girl-vintage-top-brand-ladies-watch-gold": {
    title: "Women's Black Leather Oval Quartz Watch – Waterproof",
    noun: "watch",
    facts: ["Women’s watch", "Quartz movement", "Black leather strap", "Waterproof design"],
  },
  "women-watches-top-brand-luxury-hollow-ladies-wrist-watches-women-transparent-leather-strap-watch-for-female-relogio-feminino-hot": {
    title: "Women's Transparent Leather-Strap Watch",
    noun: "watch",
    facts: ["Women’s watch", "Leather strap", "Transparent watch design"],
  },
  "top-brand-fashion-sport-electronic-watch-wristwatch-simple-digital-girls-watches-waterproof-pu-strap-alarm-clock-gift-for-women": {
    title: "Women's Digital Sports Wristwatch – Waterproof",
    noun: "watch",
    facts: ["Women’s digital watch", "Digital display", "PU strap", "Waterproof design"],
  },
  "2026-new-luxury-mens-sport-watch-fashion-top-waterproof-luminous-leather-date-quartz-wristwatch-mans-clock": {
    title: "Men's Luminous Quartz Sports Wristwatch – Waterproof",
    noun: "watch",
    facts: ["Men’s watch", "Quartz movement", "Luminous display", "Leather strap", "Waterproof design"],
  },
  "smael-top-men-military-watches-clock-for-man-sport-watch-mens-brand-luxury-analog-digital-quartz-wristwatch-waterproof": {
    title: "SMAEL Men's Analog-Digital Sports Watch – Waterproof",
    noun: "watch",
    facts: ["Men’s watch", "Analog-digital display", "Quartz movement", "Waterproof design"],
  },
  "2023-mens-watches-top-brand-luxury-wristwatch-mechanical-automatic-sport-watch-men-business-stainless-steel-watch-for-men-nh35": {
    title: "Men's Automatic Mechanical Sports Watch",
    noun: "mechanical watch",
    facts: ["Men’s watch", "Automatic mechanical movement", "Stainless-steel construction", "Sports design"],
  },
  "soft-table-runner-blush-dust-pink-gauze-rustic-boho-natural-wedding-party-baby-shower-dinning-ornament-decoration": {
    title: "Blush Dust-Pink Gauze Table Runner",
    noun: "table runner",
    facts: ["Gauze fabric", "Blush dust-pink color", "Rustic boho styling", "Suitable for weddings, parties, and baby showers"],
  },
});

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shorten(value, maximum = 158) {
  const candidate = text(value);
  if (candidate.length <= maximum) return candidate;
  const cut = candidate.slice(0, maximum + 1);
  const boundary = cut.lastIndexOf(" ");
  const result = boundary > maximum * 0.65 ? cut.slice(0, boundary) : cut.slice(0, maximum);
  return `${result.replace(/[\s,;:|/-]+$/g, "").trim()}.`;
}

function currentMedia(product) {
  return Array.isArray(product?.media?.nodes)
    ? product.media.nodes.filter((media) => media?.__typename === "MediaImage" && media?.id && media?.image?.url)
    : [];
}

function taxonomyInput(product) {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    body_html: product.descriptionHtml || "",
    product_type: product.productType || "",
    tags: Array.isArray(product.tags) ? product.tags : [],
  };
}

function buildDescription(spec) {
  const title = escapeHtml(spec.title);
  const noun = escapeHtml(spec.noun);
  const facts = spec.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("");
  const factLine = escapeHtml(spec.facts.slice(0, 3).join("; "));
  const care = spec.noun === "table runner"
    ? "Follow the supplied fabric-care instructions and store it clean and dry between uses."
    : "Follow the supplied operating or care instructions, and check the selected option details before ordering.";

  return [
    `<h2>About ${title}</h2>`,
    `<p>${title} is a ${noun} selected from the current SALT catalog. The details below reflect the product listing and available options.</p>`,
    "<h3>Key Details</h3>",
    `<ul>${facts}</ul>`,
    "<h3>Use &amp; Care</h3>",
    `<p>${escapeHtml(care)}</p>`,
    "<h3>FAQs</h3>",
    `<p><strong>Q: What is ${title}?</strong></p><p>A: ${title} is a ${noun} with the listed design and feature details.</p>`,
    `<p><strong>Q: What should I check before ordering?</strong></p><p>A: Check the selected option, dimensions or specifications, and the listed details: ${factLine}.</p>`,
  ].join("\n");
}

function buildProtectedTagsFingerprint(product) {
  const tags = Array.isArray(product?.tags)
    ? product.tags.map((tag) => String(tag)).sort()
    : [];
  return buildReleaseFingerprint({ tags });
}

function humanChangedFields(fields) {
  const labels = [];
  for (const field of ["title", "body", "product-type", "seo-title", "seo-description"]) {
    if (fields.includes(field)) labels.push(field);
  }
  const mediaCount = fields.filter((field) => field.startsWith("image-alt:")).length;
  if (mediaCount) labels.push(`image-alt (${mediaCount})`);
  return labels.join(", ");
}

function buildProductPlan(live) {
  const spec = SPECS[live.handle];
  if (!spec) throw new Error(`Missing exact SEO spec for ${live.handle}`);

  const taxonomyProduct = taxonomyInput(live);
  const override = getCatalogTaxonomyOverride(taxonomyProduct);
  const classification = classifyCatalogTaxonomy(taxonomyProduct);
  if (!override || !classification?.override || classification.ruleId !== override.ruleId) {
    throw new Error(`Approved taxonomy override did not resolve for ${live.handle}`);
  }

  const descriptionHtml = buildDescription(spec);
  const desiredProductInput = {
    id: live.id,
    title: spec.title,
    descriptionHtml,
    productType: classification.canonicalType,
    seo: {
      title: `${spec.title} | SALT`,
      description: shorten(
        `Shop ${spec.title}. Details include ${spec.facts.slice(0, 3).join(", ")}. Review the listed options and specifications before ordering at SALT.`,
      ),
    },
  };
  const desiredMediaTargets = currentMedia(live).map((media) => ({ imageSrc: media.image.url, alt: spec.title }));
  const productPlan = {
    handle: live.handle,
    productId: live.id,
    desiredProductInput,
    desiredMediaTargets,
    // Preserve the currently managed minimum-quantity tag; this plan is not a tag or pricing release.
    desiredQuantityTag: managedMinimumQuantityTagFromTags(live.tags),
  };
  const diff = compareLiveProductToPlan(live, productPlan);
  const desiredCopy = `${spec.title} ${descriptionHtml} ${desiredProductInput.productType} ${desiredProductInput.seo.title} ${desiredProductInput.seo.description}`.toLowerCase();
  if (/\bshirt\b|\bmakeup\b/.test(desiredCopy)) {
    throw new Error(`Incorrect semantic term leaked into desired copy for ${live.handle}`);
  }

  return {
    handle: live.handle,
    productId: live.id,
    legacyResourceId: live.legacyResourceId,
    current: {
      updatedAt: live.updatedAt,
      title: live.title,
      productType: live.productType,
      seo: live.seo || { title: null, description: null },
      descriptionHtml: live.descriptionHtml || "",
      mediaCount: currentMedia(live).length,
      currentMediaAltSamples: [...new Set(currentMedia(live).map((media) => text(media.alt)).filter(Boolean))].slice(0, 5),
    },
    taxonomy: {
      overrideId: override.id,
      ruleId: override.ruleId,
      reason: override.reason,
      canonicalType: classification.canonicalType,
      familyId: classification.familyId,
      departmentId: classification.departmentId,
      categoryId: classification.categoryId,
      subcategoryId: classification.subcategoryId,
      confidence: classification.confidence,
    },
    desired: {
      title: spec.title,
      productType: classification.canonicalType,
      seo: desiredProductInput.seo,
      descriptionHtml,
      mediaAlt: spec.title,
    },
    changedFields: diff.changedFields,
    skippedFields: diff.skippedFields,
    unresolved: diff.unresolved,
    writeCount: diff.writeCount,
    liveFingerprint: buildLiveFingerprint(live),
    liveTagsFingerprint: buildProtectedTagsFingerprint(live),
    desiredFingerprint: buildDesiredFingerprint(productPlan),
  };
}

const livePayload = JSON.parse(await readFile(livePath, "utf8"));
const products = Array.isArray(livePayload.products) ? livePayload.products : [];
const plans = products.map(buildProductPlan);
if (plans.length !== Object.keys(SPECS).length) {
  throw new Error(`Expected ${Object.keys(SPECS).length} products, found ${plans.length}`);
}

const summary = {
  products: plans.length,
  currentLiveReadProducts: products.length,
  taxonomyOverridesApplied: plans.length,
  productTypesToCorrect: plans.filter((product) => product.changedFields.includes("product-type")).length,
  titlesToCorrect: plans.filter((product) => product.changedFields.includes("title")).length,
  bodiesToCorrect: plans.filter((product) => product.changedFields.includes("body")).length,
  seoTitlesToCorrect: plans.filter((product) => product.changedFields.includes("seo-title")).length,
  seoDescriptionsToCorrect: plans.filter((product) => product.changedFields.includes("seo-description")).length,
  mediaAltTargets: plans.reduce((count, product) => count + product.changedFields.filter((field) => field.startsWith("image-alt:")).length, 0),
  fieldChanges: plans.reduce((count, product) => count + product.changedFields.length, 0),
  totalWrites: plans.reduce((count, product) => count + product.writeCount, 0),
  pricesOrVariantsChanged: false,
  mode: "fresh-live-read dry-run; no Shopify mutations applied",
};

const output = {
  planVersion: "2026-09-14.1",
  generatedAt: new Date().toISOString(),
  liveSnapshotGeneratedAt: livePayload.generatedAt,
  liveSnapshotPath: liveEvidencePath,
  source: livePayload.source,
  scope: "Exact 12 GSC semantic-repair products",
  mutationPolicy: "SEO/content and image-alt fields only; preserve prices, variants, inventory, tags, and URLs",
  summary,
  products: plans,
};

await writeFile(liveEvidencePath, `${JSON.stringify(livePayload, null, 2)}\n`, "utf8");
await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const markdown = [
  "# SALT GSC Semantic Repair — Fresh 12-Product SEO Plan",
  "",
  `Generated: ${output.generatedAt}`,
  `Fresh Shopify Admin read: ${livePayload.generatedAt}`,
  `Scope: ${output.scope}`,
  "",
  "## Summary",
  "",
  "- 12/12 products verified from fresh Shopify Admin data.",
  "- 12/12 approved taxonomy overrides matched and classified.",
  `- Product type corrections: ${summary.productTypesToCorrect}; title corrections: ${summary.titlesToCorrect}; body corrections: ${summary.bodiesToCorrect}.`,
  `- SEO title corrections: ${summary.seoTitlesToCorrect}; meta-description corrections: ${summary.seoDescriptionsToCorrect}.`,
  `- Image-alt targets: ${summary.mediaAltTargets}; planned writes: ${summary.totalWrites}.`,
  "- Prices, variants, inventory, tags, and URLs: unchanged/not included.",
  "",
  "## Product queue",
  "",
  "| # | Current live issue | Approved taxonomy | Proposed title | Proposed type | Changes |",
  "|---:|---|---|---|---|---|",
  ...plans.map((product, index) => {
    const current = product.current;
    const desired = product.desired;
    return `| ${index + 1} | \`${current.title}\` / \`${current.productType}\` | \`${product.taxonomy.ruleId}\` → ${desired.productType} | ${desired.title} | ${desired.productType} | ${humanChangedFields(product.changedFields)} |`;
  }),
  "",
  "## Safety checks",
  "",
  "- Fresh source contained exactly 12 requested handles.",
  "- Every desired title/body/SEO field was checked for the incorrect `shirt`/`makeup` labels.",
  "- This is a dry-run plan only; no Shopify Admin mutation was sent.",
  "",
  `JSON manifest: \`${jsonPath}\``,
  "",
].join("\n");
await writeFile(markdownPath, markdown, "utf8");

console.log(JSON.stringify({ jsonPath, markdownPath, liveEvidencePath, generatedAt: output.generatedAt, liveSnapshotGeneratedAt: livePayload.generatedAt, summary, products: plans.map((product) => ({ handle: product.handle, currentType: product.current.productType, desiredType: product.desired.productType, currentTitle: product.current.title, desiredTitle: product.desired.title, changedFields: product.changedFields, writeCount: product.writeCount })) }, null, 2));
