#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const baseUrl = process.env.SALT_SHOP_URL || DEFAULT_SHOP_BASE;
const limit = Number(process.env.SALT_PAGE_LIMIT || 250);
const aboutHandle = process.env.SALT_ABOUT_HANDLE || "about-us";
const blogHandleInput = process.env.SALT_BLOG_HANDLE || "posts,news,blog,journal,updates,whom-we-serve";
const blogHandles = Array.from(
  new Set(
    blogHandleInput
      .split(",")
      .map((handle) => handle.trim())
      .filter(Boolean),
  ),
);
const outDir = resolve(process.cwd(), "public", "data");

async function fetchJsonUrl(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchPaged(key, endpoint) {
  const rows = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${endpoint}?limit=${limit}&page=${page}`;
    const json = await fetchJsonUrl(url);
    const chunk = Array.isArray(json[key]) ? json[key] : [];

    rows.push(...chunk);
    process.stdout.write(`Fetched ${key} page ${page}: ${chunk.length}\n`);

    if (chunk.length < limit) {
      break;
    }

    page += 1;
  }

  return rows;
}

async function fetchCollectionProductIds(handle) {
  const ids = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    const payload = await fetchJsonUrl(url);
    const products = Array.isArray(payload.products) ? payload.products : [];

    ids.push(...products.map((product) => product.id));

    if (products.length < limit) {
      break;
    }

    page += 1;
  }

  return ids;
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.published_at || "1970-01-01");
    const bTime = Date.parse(b.updated_at || b.published_at || "1970-01-01");
    return bTime - aTime;
  });
}

function decodeEntities(input = "") {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(input = "") {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFromHtml(input = "", limitChars = 200) {
  const cleaned = stripHtml(input);
  if (cleaned.length <= limitChars) {
    return cleaned;
  }

  return `${cleaned.slice(0, limitChars - 1).trimEnd()}…`;
}

function firstImageSrcFromHtml(input = "") {
  const match = input.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function readTag(input, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = input.match(pattern);
  return match?.[1]?.trim() || "";
}

function parseBlogEntriesFromAtom(atomXml) {
  const matches = [...atomXml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];

  return matches
    .map((match) => {
      const block = match[1] || "";
      const id = decodeEntities(readTag(block, "id"));
      const publishedAt = readTag(block, "published");
      const updatedAt = readTag(block, "updated");
      const title = decodeEntities(readTag(block, "title"));
      const author = decodeEntities(readTag(block, "name")) || "SALT";
      const linkMatch = block.match(
        /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      );
      const url = decodeEntities(linkMatch?.[1] || id);
      const handle = url.split("/").filter(Boolean).at(-1) || "";
      const rawContent = readTag(block, "content");
      const contentHtml = rawContent
        .replace(/^<!\[CDATA\[/i, "")
        .replace(/\]\]>$/i, "")
        .trim();
      const image = firstImageSrcFromHtml(contentHtml);

      return {
        id,
        handle,
        url,
        title,
        author,
        publishedAt,
        updatedAt,
        excerpt: excerptFromHtml(contentHtml),
        contentHtml,
        image,
      };
    })
    .filter((entry) => Boolean(entry.handle && entry.url && entry.title))
    .sort((a, b) => Date.parse(b.publishedAt || "1970-01-01") - Date.parse(a.publishedAt || "1970-01-01"));
}

async function fetchAboutPage() {
  const response = await fetch(`${baseUrl}/pages/${aboutHandle}.json`);
  if (response.status === 404) {
    return {
      id: 0,
      handle: aboutHandle,
      title: "About",
      bodyHtml: "",
      publishedAt: "",
      updatedAt: "",
    };
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${baseUrl}/pages/${aboutHandle}.json`);
  }

  const payload = await response.json();
  const page = payload?.page || {};

  return {
    id: Number(page.id || 0),
    handle: page.handle || aboutHandle,
    title: page.title || "About",
    bodyHtml: page.body_html || "",
    publishedAt: page.published_at || "",
    updatedAt: page.updated_at || "",
  };
}

async function fetchBlogPosts() {
  for (const handle of blogHandles) {
    const response = await fetch(`${baseUrl}/blogs/${handle}.atom`);
    if (response.status === 404) {
      process.stdout.write(`Blog handle "${handle}" not found on ${baseUrl}\n`);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${baseUrl}/blogs/${handle}.atom`);
    }

    const atom = await response.text();
    const posts = parseBlogEntriesFromAtom(atom);

    if (!posts.length) {
      process.stdout.write(`Blog handle "${handle}" returned 0 published posts\n`);
      continue;
    }

    process.stdout.write(`Using blog handle "${handle}" with ${posts.length} posts\n`);
    return {
      blogHandle: handle,
      source: baseUrl,
      posts,
    };
  }

  process.stdout.write("No public blog feed found; saving zero live posts\n");
  return {
    blogHandle: blogHandles[0] || "posts",
    source: baseUrl,
    posts: [],
  };
}

async function main() {
  const startedAt = new Date().toISOString();

  const [products, collections, aboutPage, blogResult] = await Promise.all([
    fetchPaged("products", "/products.json"),
    fetchPaged("collections", "/collections.json"),
    fetchAboutPage(),
    fetchBlogPosts(),
  ]);

  const productPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: products.length,
    products: sortByUpdatedAt(products),
  };

  const collectionPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: collections.length,
    collections: sortByUpdatedAt(collections),
  };

  const collectionProductMap = {
    generatedAt: startedAt,
    source: baseUrl,
    totalCollections: collections.length,
    collections: {},
  };

  const aboutPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    page: aboutPage,
  };

  const blogPayload = {
    generatedAt: startedAt,
    source: blogResult.source,
    blogHandle: blogResult.blogHandle,
    total: blogResult.posts.length,
    posts: blogResult.posts,
  };

  for (const collection of collections) {
    const ids = await fetchCollectionProductIds(collection.handle);
    collectionProductMap.collections[collection.handle] = {
      title: collection.title,
      productIds: ids,
    };

    process.stdout.write(
      `Fetched collection mapping ${collection.handle}: ${ids.length} products\n`,
    );
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "products.json"), JSON.stringify(productPayload));
  await writeFile(resolve(outDir, "collections.json"), JSON.stringify(collectionPayload));
  await writeFile(
    resolve(outDir, "collection-products.json"),
    JSON.stringify(collectionProductMap),
  );
  await writeFile(resolve(outDir, "about.json"), JSON.stringify(aboutPayload));
  await writeFile(resolve(outDir, "blog-posts.json"), JSON.stringify(blogPayload));

  process.stdout.write(`Saved ${productPayload.total} products to public/data/products.json\n`);
  process.stdout.write(`Saved ${collectionPayload.total} collections to public/data/collections.json\n`);
  process.stdout.write(
    `Saved collection product mapping to public/data/collection-products.json\n`,
  );
  process.stdout.write(`Saved About page to public/data/about.json\n`);
  process.stdout.write(`Saved ${blogPayload.total} blog posts to public/data/blog-posts.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
