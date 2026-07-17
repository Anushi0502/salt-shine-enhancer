#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildRecentlyOrderedProductsPayload } from "../src/lib/recently-ordered-products-core.js";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(rootDir, "public/data/recently-ordered-products.json");
const shopBase = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
const shopDomain = new URL(shopBase).hostname;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const adminToken =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
  process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN ||
  "";

export const RECENT_ORDER_PRODUCTS_QUERY = /* GraphQL */ `
  query RecentlyOrderedProducts {
    orders(first: 20, sortKey: CREATED_AT, reverse: true) {
      nodes {
        createdAt
        cancelledAt
        lineItems(first: 50) {
          nodes {
            title
            product {
              id
              title
              handle
              featuredMedia {
                preview {
                  image {
                    url
                    altText
                  }
                }
              }
            }
            variant {
              price
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;

async function queryWithAdminToken() {
  const response = await fetch(`${new URL(shopBase).origin}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminToken,
    },
    body: JSON.stringify({ query: RECENT_ORDER_PRODUCTS_QUERY }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors?.map((error) => error.message).join(" | ") || response.statusText;
    throw new Error(`Shopify recent orders query failed: ${detail}`);
  }
  return payload.data;
}

async function queryWithShopifyCli() {
  const tempDir = await mkdtemp(join(tmpdir(), "salt-recent-orders-"));
  const queryFile = join(tempDir, "query.graphql");
  const outputFile = join(tempDir, "result.json");

  try {
    await writeFile(queryFile, RECENT_ORDER_PRODUCTS_QUERY, "utf8");
    await execFileAsync(
      "shopify",
      [
        "store",
        "execute",
        "--store",
        shopDomain,
        "--version",
        apiVersion,
        "--query-file",
        queryFile,
        "--output-file",
        outputFile,
        "--json",
      ],
      { env: process.env, maxBuffer: 10 * 1024 * 1024 },
    );
    const payload = JSON.parse(await readFile(outputFile, "utf8"));
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join(" | "));
    }
    return payload.data || payload;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function loadCommittedFallback() {
  const payload = JSON.parse(await readFile(outputPath, "utf8"));
  if (!Array.isArray(payload?.products) || payload.products.length < 4) {
    throw new Error("Committed recently ordered product fallback is missing or incomplete");
  }
  return payload;
}

let payload;

if (adminToken) {
  const data = await queryWithAdminToken();
  payload = buildRecentlyOrderedProductsPayload(data?.orders, { limit: 4 });
} else {
  try {
    const data = await queryWithShopifyCli();
    payload = buildRecentlyOrderedProductsPayload(data?.orders, { limit: 4 });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    payload = await loadCommittedFallback();
    process.stdout.write(
      "Shopify CLI is unavailable; preserving the committed recently ordered product feed.\n",
    );
  }
}

if (payload.products.length < 4) {
  throw new Error(`Shopify returned only ${payload.products.length} unique recently ordered products`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`Saved ${payload.products.length} recently ordered Shopify products to ${outputPath}\n`);
