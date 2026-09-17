#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = process.cwd();
const origin = (process.env.SALT_PUBLIC_SITEMAP_ORIGIN || "https://www.saltonlinestore.com").replace(/\/+$/, "");
const dataDir = resolve(rootDir, "public", "data");
const outputPath = resolve(rootDir, "public", "sitemap.xml");
const resourceSitemapOutputPath = resolve(rootDir, "public", "salt-resource-sitemap.xml");

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readTimestamp(value) {
  const timestamp = new Date(String(value || "")).getTime();
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
  } catch {
    return null;
  }
}

async function readFirstJson(paths) {
  for (const path of paths) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Keep looking for the next approved catalog source.
    }
  }

  return null;
}

const [productsPayload, collectionsPayload, blogPayload] = await Promise.all([
  readFirstJson([
    resolve(dataDir, "products.json"),
    // Product listing payloads are intentionally not part of the storefront
    // runtime. The release catalog remains an approved sitemap-only source.
    resolve(rootDir, "output", "release-catalog-source.json"),
  ]),
  readJson("collections.json"),
  readJson("blog-posts.json"),
]);

// Keep the answer-first resource routes discoverable on Shopify's server-200
// native page path. The React app uses the query parameters to select the
// answer page; `/shop` query/filter URLs remain noindex utility views.
const resourceHubRoutes = [
  "senior-living-guides",
  "senior-living-guides/best-gifts-for-seniors",
  "senior-living-guides/home-safety-tips",
  "senior-living-guides/caregiver-resources",
  "home-living",
  "home-living/how-to-stay-organized-at-home",
  "home-living/small-space-organization-tips",
  "home-living/decluttering-your-home",
  "home-living/creating-a-comfortable-living-space",
  "lifestyle-wellness",
  "lifestyle-wellness/simple-habits-for-a-less-stressful-life",
  "lifestyle-wellness/creating-better-daily-routines",
  "lifestyle-wellness/work-life-balance-tips",
  "lifestyle-wellness/self-care-at-home",
  "gift-guides",
  "gift-guides/best-gifts-for-mom",
  "gift-guides/best-gifts-for-dad",
  "gift-guides/best-gifts-for-grandparents",
  "gift-guides/housewarming-gift-ideas",
  "gift-guides/holiday-gift-guides",
  "gift-guides/practical-gifts-for-someone-who-has-everything",
  "home-safety-organization",
  "home-safety-organization/home-safety-tips-for-every-age",
  "home-safety-organization/organizing-important-documents",
  "home-safety-organization/family-emergency-preparedness",
  "home-safety-organization/keeping-your-home-clutter-free",
  "family-legacy",
  "family-legacy/preserving-family-memories",
  "family-legacy/why-every-family-should-have-important-information-organized",
  "family-legacy/creating-a-family-legacy",
  "family-legacy/planning-for-the-future",
  "pet-home-life",
  "pet-home-life/organizing-pet-supplies",
  "pet-home-life/making-your-home-pet-friendly",
  "pet-home-life/travel-tips-for-pet-owners",
];

const productRecords = Array.isArray(productsPayload?.products)
  ? productsPayload.products
  : (
      await Promise.all(
        (Array.isArray(productsPayload?.shards) ? productsPayload.shards : []).map(async (shard) => {
          const payload = await readJson(String(shard?.file || ""));
          return Array.isArray(payload?.products) ? payload.products : [];
        }),
      )
    ).flat();

const urls = new Map();
const addUrl = (path, options = {}) => {
  const normalizedPath = String(path || "").replace(/\/+/g, "/");
  if (!normalizedPath.startsWith("/")) {
    return;
  }

  const existing = urls.get(normalizedPath) || {};
  const lastmod = readTimestamp(options.lastmod);
  urls.set(normalizedPath, {
    ...existing,
    ...options,
    lastmod: lastmod || existing.lastmod || "",
  });
};

[
  ["/", "daily", "1.0"],
  ["/collections", "daily", "0.9"],
  ["/pages/blog", "daily", "0.8"],
  ["/pages/about-us", "weekly", "0.7"],
  ["/pages/contact-us", "weekly", "0.7"],
  ["/pages/resources", "weekly", "0.7"],
  ["/pages/faq", "weekly", "0.7"],
  ["/pages/affiliate-program", "weekly", "0.6"],
  ["/pages/mission-vision", "weekly", "0.6"],
  ["/pages/wholesale-inquiries", "weekly", "0.6"],
  ["/pages/terms-conditions", "weekly", "0.5"],
].forEach(([path, changefreq, priority]) => addUrl(path, { changefreq, priority }));

for (const route of resourceHubRoutes) {
  addUrl(`/pages/resources?resource=guide&handle=${encodeURIComponent(route)}`, {
    changefreq: "monthly",
    priority: route.includes("/") ? "0.6" : "0.7",
  });
}

for (const collection of Array.isArray(collectionsPayload?.collections) ? collectionsPayload.collections : []) {
  const handle = String(collection?.handle || "").trim();
  if (!handle) continue;
  addUrl(`/collections/${encodeURIComponent(handle)}`, {
    changefreq: "weekly",
    priority: "0.8",
    lastmod: collection.updated_at || collection.published_at,
  });
}

for (const product of productRecords) {
  const handle = String(product?.handle || "").trim();
  if (!handle || (product?.status && String(product.status).toLowerCase() !== "active")) continue;
  addUrl(`/products/${encodeURIComponent(handle)}`, {
    changefreq: "weekly",
    priority: "0.7",
    lastmod: product.updated_at || product.published_at || product.created_at,
  });
}

for (const post of Array.isArray(blogPayload?.posts) ? blogPayload.posts : []) {
  const handle = String(post?.handle || "").trim();
  if (!handle) continue;
  addUrl(`/blogs/posts/${encodeURIComponent(handle)}`, {
    changefreq: "monthly",
    priority: "0.6",
    lastmod: post.updatedAt || post.updated_at || post.publishedAt || post.published_at,
  });
}

const renderSitemap = (entries) => entries
  .map(([path, entry]) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeXml(`${origin}${path}`)}</loc>${lastmod}\n    <changefreq>${escapeXml(entry.changefreq || "weekly")}</changefreq>\n    <priority>${escapeXml(entry.priority || "0.5")}</priority>\n  </url>`;
  })
  .join("\n");

await writeFile(
  outputPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${renderSitemap(Array.from(urls.entries()))}\n</urlset>\n`,
  "utf8",
);

const resourceSitemapEntries = resourceHubRoutes.map((route) => {
  const path = `/pages/resources?resource=guide&handle=${encodeURIComponent(route)}`;
  return [path, urls.get(path) || { changefreq: "monthly", priority: route.includes("/") ? "0.6" : "0.7" }];
});

await writeFile(
  resourceSitemapOutputPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${renderSitemap(resourceSitemapEntries)}\n</urlset>\n`,
  "utf8",
);

process.stdout.write(`Generated ${urls.size} sitemap URLs at ${outputPath} and ${resourceSitemapEntries.length} resource URLs at ${resourceSitemapOutputPath}\n`);
