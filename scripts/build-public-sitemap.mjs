#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = process.cwd();
const origin = (process.env.SALT_PUBLIC_SITEMAP_ORIGIN || "https://www.saltonlinestore.com").replace(/\/+$/, "");
const dataDir = resolve(rootDir, "public", "data");
const outputPath = resolve(rootDir, "public", "sitemap.xml");

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

const body = Array.from(urls.entries())
  .map(([path, entry]) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeXml(`${origin}${path}`)}</loc>${lastmod}\n    <changefreq>${escapeXml(entry.changefreq || "weekly")}</changefreq>\n    <priority>${escapeXml(entry.priority || "0.5")}</priority>\n  </url>`;
  })
  .join("\n");

await writeFile(
  outputPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  "utf8",
);

process.stdout.write(`Generated ${urls.size} sitemap URLs at ${outputPath}\n`);
