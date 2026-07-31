#!/usr/bin/env node

import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const baseUrl = process.env.SALT_SHOP_URL || DEFAULT_SHOP_BASE;
const pageLimit = Number(process.env.SALT_PAGE_LIMIT || 250);
const maxAttempts = Number(process.env.SALT_PRICE_VERIFY_MAX_ATTEMPTS || 6);
const retryDelayMs = Number(process.env.SALT_PRICE_VERIFY_RETRY_DELAY_MS || 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMoney(value) {
  if (value == null || value === "") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value).trim();
}

async function fetchPage(page) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = new URL("/products.json", baseUrl);
    url.searchParams.set("limit", String(pageLimit));
    url.searchParams.set("page", String(page));
    url.searchParams.set("salt_price_verify", String(Date.now()));
    const response = await fetch(url);
    lastStatus = response.status;

    if (response.ok) {
      return response.json();
    }

    if (response.status !== 429 && (response.status < 500 || response.status >= 600)) {
      throw new Error(`Live product readback failed on page ${page} (${response.status})`);
    }

    await sleep(Math.min(retryDelayMs * attempt, 10_000));
  }

  throw new Error(`Live product readback failed on page ${page} after ${maxAttempts} attempts (${lastStatus})`);
}

const catalog = await readProductCatalogPayload("public/data");
const localVariants = new Map();

for (const product of catalog.products) {
  for (const variant of product.variants || []) {
    localVariants.set(String(variant.id), {
      productId: product.id,
      handle: product.handle,
      price: normalizeMoney(variant.price),
      compareAtPrice: normalizeMoney(variant.compare_at_price),
    });
  }
}

const mismatches = [];
const missingVariants = [];
let liveProductCount = 0;
let liveVariantCount = 0;

for (let page = 1; ; page += 1) {
  const payload = await fetchPage(page);
  const products = Array.isArray(payload?.products) ? payload.products : [];
  liveProductCount += products.length;

  for (const product of products) {
    for (const variant of product.variants || []) {
      liveVariantCount += 1;
      const local = localVariants.get(String(variant.id));
      if (!local) {
        missingVariants.push({ productId: product.id, handle: product.handle, variantId: variant.id });
        continue;
      }

      const livePrice = normalizeMoney(variant.price);
      const liveCompareAtPrice = normalizeMoney(variant.compare_at_price);
      if (local.price !== livePrice || local.compareAtPrice !== liveCompareAtPrice) {
        mismatches.push({
          productId: product.id,
          handle: product.handle,
          variantId: variant.id,
          localPrice: local.price,
          livePrice,
          localCompareAtPrice: local.compareAtPrice,
          liveCompareAtPrice,
        });
      }
    }
  }

  if (products.length < pageLimit) {
    break;
  }
}

if (missingVariants.length || mismatches.length) {
  const examples = [...missingVariants.slice(0, 5), ...mismatches.slice(0, 10)];
  throw new Error(
    [
      `Catalog pricing verification failed: ${mismatches.length} price mismatch(es), ${missingVariants.length} missing live variant(s).`,
      `Checked ${liveProductCount} live products and ${liveVariantCount} live variants against ${catalog.products.length} generated products.`,
      `Examples: ${JSON.stringify(examples)}`,
    ].join("\n"),
  );
}

process.stdout.write(
  `Verified generated pricing against ${liveProductCount} live products and ${liveVariantCount} live variants.\n`,
);
