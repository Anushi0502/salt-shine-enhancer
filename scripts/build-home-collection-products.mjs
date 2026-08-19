import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectionProductsPath = path.join(projectRoot, "public/data/collection-products.json");
const outputPath = path.join(projectRoot, "public/data/home-collection-products.json");
const PRODUCT_LIMIT = 12;

const sectionConfigs = [
  {
    key: "animeCollectables",
    title: "Anime Collectables",
    handle: "anime-collectables",
    sourceHandles: ["anime-collectables"],
    maxPerCategory: 3,
    categories: [
      ["figures", ["anime", "manga", "figure", "figurine", "collectable", "collectible", "statue"]],
      ["accessories", ["keychain", "plush", "cosplay", "poster", "display case"]],
    ],
    blocked: ["makeup", "cosmetic", "kitchen", "watch", "charger", "cable", "lingerie", "underwear"],
  },
  {
    key: "creatorEssentials",
    title: "Creator Essentials",
    handle: "creator-essentials",
    sourceHandles: ["creator-essentials"],
    maxPerCategory: 3,
    categories: [
      ["camera", ["camera", "photography", "tripod", "microphone", "ring light", "led light"]],
      ["desk", ["phone stand", "laptop stand", "usb", "stream", "studio", "creator"]],
      ["audio", ["headphone", "earphone", "speaker", "wireless mic"]],
    ],
    blocked: ["kitchen", "cosmetic", "watch", "baby", "toy", "pet", "knife"],
  },
  {
    key: "lipCare",
    title: "Lip Care",
    handle: "lips-and-care",
    sourceHandles: ["lips-and-care", "lip-care"],
    maxPerCategory: 4,
    categories: [
      ["lips", ["lipstick", "lip gloss", "lip balm", "lip oil", "lip care", "lip liner", "lip stain"]],
      ["beauty", ["cosmetic", "makeup", "beauty"]],
    ],
    blocked: ["baby", "kitchen", "watch", "charger", "cable", "toy", "pet", "cleaner"],
  },
  {
    key: "watches",
    title: "Watches",
    handle: "watches",
    sourceHandles: ["watches", "mens-watches", "womens-watches"],
    maxPerCategory: 6,
    categories: [
      ["watches", ["watch", "watches", "smartwatch", "wristwatch", "timepiece", "chronograph"]],
    ],
    blocked: ["charger", "cable", "case", "kitchen", "knife", "toy", "makeup", "cosmetic"],
  },
  {
    key: "glamEyePalettes",
    title: "Glam Eye Palettes",
    handle: "glam-eye-palettes",
    sourceHandles: ["glam-eye-palettes", "eye-beauty-collection"],
    maxPerCategory: 6,
    categories: [
      ["eyes", ["eyeshadow", "eye shadow", "palette", "eyeliner", "mascara", "eyebrow", "eye makeup"]],
      ["tools", ["makeup brush", "beauty tool", "cosmetic", "makeup"]],
    ],
    blocked: ["lip", "baby", "kitchen", "watch", "charger", "cable", "pet", "cleaner"],
  },
];

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildProductCard(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const pricedVariants = variants
    .map((variant) => ({
      price: Number(variant?.price),
      compareAtPrice: Number(variant?.compare_at_price),
    }))
    .filter((variant) => Number.isFinite(variant.price) && variant.price > 0)
    .sort((left, right) => left.price - right.price);
  const cheapest = pricedVariants[0];
  const image = String(product?.image?.src || product?.images?.[0]?.src || "").trim();
  const id = Number(product?.id || 0);
  const title = String(product?.title || "").replace(/\s+/g, " ").trim();
  const handle = String(product?.handle || "").trim();

  if (!id || !title || !handle || !image || !cheapest) {
    return null;
  }

  return {
    id,
    title,
    handle,
    image,
    price: cheapest.price,
    compareAtPrice:
      Number.isFinite(cheapest.compareAtPrice) && cheapest.compareAtPrice > cheapest.price
        ? cheapest.compareAtPrice
        : null,
  };
}

function selectProducts(products, collectionMap, config) {
  const collectionIds = new Set(
    config.sourceHandles.flatMap((handle) => collectionMap[handle]?.productIds || []),
  );
  const candidates = products
    .map((product) => {
      const card = buildProductCard(product);
      if (!card) return null;

      const tags = Array.isArray(product.tags) ? product.tags.join(" ") : product.tags || "";
      const search = normalizeText(`${product.title} ${product.handle} ${product.product_type || ""} ${tags}`);
      if (config.blocked.some((term) => search.includes(normalizeText(term)))) return null;

      const categoryMatches = config.categories
        .map(([category, terms]) => ({
          category,
          matches: terms.filter((term) => search.includes(normalizeText(term))).length,
        }))
        .filter((entry) => entry.matches > 0);
      if (!categoryMatches.length) return null;

      const keywordScore = categoryMatches.reduce((total, entry) => total + entry.matches * 3, 0);
      return {
        card,
        category: categoryMatches.sort((left, right) => right.matches - left.matches)[0].category,
        score: keywordScore + (collectionIds.has(card.id) ? 2 : 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.card.price - right.card.price);

  const selected = [];
  const seenIds = new Set();
  const seenTitles = new Set();
  const categoryCounts = new Map();
  const add = (candidate, enforceDiversity) => {
    const titleKey = normalizeText(candidate.card.title);
    if (
      selected.length >= PRODUCT_LIMIT ||
      seenIds.has(candidate.card.id) ||
      seenTitles.has(titleKey) ||
      (enforceDiversity && (categoryCounts.get(candidate.category) || 0) >= config.maxPerCategory)
    ) return;

    selected.push(candidate.card);
    seenIds.add(candidate.card.id);
    seenTitles.add(titleKey);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) || 0) + 1);
  };

  candidates.forEach((candidate) => add(candidate, true));
  candidates.forEach((candidate) => add(candidate, false));
  return selected;
}

const [productsPayload, collectionProductsPayload] = await Promise.all([
  readProductCatalogPayload(path.join(projectRoot, "public/data")),
  readFile(collectionProductsPath, "utf8").then(JSON.parse),
]);
const products = Array.isArray(productsPayload?.products) ? productsPayload.products : [];
const collectionMap = collectionProductsPayload?.collections || {};
const sections = Object.fromEntries(
  sectionConfigs.map((config) => [
    config.key,
    {
      title: config.title,
      handle: config.handle,
      products: selectProducts(products, collectionMap, config),
    },
  ]),
);

const payload = {
  generatedAt: productsPayload?.generatedAt || new Date().toISOString(),
  source: productsPayload?.source || "/data/products.json",
  sections,
};

await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(
  `Wrote ${Object.values(sections).reduce((total, section) => total + section.products.length, 0)} homepage collection products to ${outputPath}`,
);
