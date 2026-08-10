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
const RECENTLY_ORDERED_PRODUCT_LIMIT = 1000;

export const RECENT_ORDER_PRODUCTS_QUERY = /* GraphQL */ `
  query RecentlyOrderedProducts {
    orders(first: 100, sortKey: CREATED_AT, reverse: true) {
      nodes {
        createdAt
        cancelledAt
        lineItems(first: 100) {
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
  if (!response.ok || payload.errors) {
    const detail = formatShopifyErrors(payload.errors) || response.statusText;
    const error = new Error(`Shopify recent orders query failed: ${detail}`);
    error.status = response.status;
    throw error;
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
    if (payload.errors) {
      throw new Error(formatShopifyErrors(payload.errors));
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

function isMissingShopifyAuth(error) {
  const message = [error?.message, error?.stderr, error?.stdout]
    .filter(Boolean)
    .join(" ");
  return /No stored app authentication found|shopify store auth/i.test(message);
}

function formatShopifyErrors(errors) {
  if (Array.isArray(errors)) {
    return errors
      .map((error) => (typeof error === "string" ? error : error?.message || JSON.stringify(error)))
      .filter(Boolean)
      .join(" | ");
  }

  if (typeof errors === "string") {
    return errors;
  }

  if (errors && typeof errors === "object") {
    return errors.message || errors.error || JSON.stringify(errors);
  }

  return "";
}

function isAdminAuthFailure(error) {
  const message = [error?.message, error?.stderr, error?.stdout]
    .filter(Boolean)
    .join(" ");
  return error?.status === 401 || error?.status === 403 || /unauthori[sz]ed|access denied|invalid api key|invalid access token/i.test(message);
}

let payload;

if (adminToken) {
  try {
    const data = await queryWithAdminToken();
    payload = buildRecentlyOrderedProductsPayload(data?.orders, {
      limit: RECENTLY_ORDERED_PRODUCT_LIMIT,
      minPriceExclusive: 34,
    });
  } catch (error) {
    if (!isAdminAuthFailure(error)) throw error;
    payload = await loadCommittedFallback();
    process.stdout.write(
      "Shopify Admin authentication is unavailable; preserving the committed recently ordered product feed.\n",
    );
  }
} else {
  try {
    const data = await queryWithShopifyCli();
    payload = buildRecentlyOrderedProductsPayload(data?.orders, {
      limit: RECENTLY_ORDERED_PRODUCT_LIMIT,
      minPriceExclusive: 34,
    });
  } catch (error) {
    if (error?.code !== "ENOENT" && !isMissingShopifyAuth(error) && !isAdminAuthFailure(error)) throw error;
    payload = await loadCommittedFallback();
    process.stdout.write(
      "Shopify CLI authentication is unavailable; preserving the committed recently ordered product feed.\n",
    );
  }
}

if (payload.products.length < 4) {
  throw new Error(
    `Shopify returned only ${payload.products.length} unique recently ordered products priced above $34`,
  );
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`Saved ${payload.products.length} recently ordered Shopify products to ${outputPath}\n`);
