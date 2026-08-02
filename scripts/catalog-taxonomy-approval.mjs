#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CATALOG_TAXONOMY_VERSION } from "../src/lib/catalog-taxonomy.js";

const rootDir = resolve(import.meta.dirname, "..");
const approvalPath = resolve(rootDir, "docs", "catalog-taxonomy-approval.json");

function approvalError(message) {
  throw new Error(
    `${message}\n` +
      "Shopify writes are blocked until the catalog taxonomy proposal is approved and recorded in docs/catalog-taxonomy-approval.json.",
  );
}

async function readApproval() {
  try {
    return JSON.parse(await readFile(approvalPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      approvalError("No catalog taxonomy approval manifest exists.");
    }
    approvalError(`Could not read catalog taxonomy approval manifest: ${error.message}`);
  }
}

async function main() {
  const approval = await readApproval();
  const approvalId = String(approval?.approvalId || "").trim();

  if (approval?.approved !== true) approvalError("Catalog taxonomy approval manifest is not marked approved.");
  if (!approvalId) approvalError("Catalog taxonomy approval manifest has no approvalId.");
  if (approval?.taxonomyVersion !== CATALOG_TAXONOMY_VERSION) {
    approvalError(
      `Approval targets taxonomy ${String(approval?.taxonomyVersion || "unknown")}, but the active taxonomy is ${CATALOG_TAXONOMY_VERSION}.`,
    );
  }
  if (approval?.scope?.existingShopifyTags !== "preserve-exactly") {
    approvalError("Approval does not require exact preservation of existing Shopify tags.");
  }
  if (approval?.scope?.managedTags !== "add-only salt namespace") {
    approvalError("Approval does not limit managed tags to the additive salt namespace.");
  }
  if (approval?.scope?.taxonomyClassification !== "approved for every active Shopify product; image-verified ambiguity overrides are required before controlled category tags") {
    approvalError("Approval does not require image-verified resolution before ambiguous controlled category tags.");
  }
  if (approval?.scope?.seo !== "approved for every active Shopify product through guarded flow with prices preserved") {
    approvalError("Approval does not cover SEO for every active Shopify product.");
  }
  if (approval?.scope?.salesChannel !== "publish every active product to every available sales channel only after all release tasks verify; never change draft or archived status") {
    approvalError("Approval does not enforce the final all-sales-channel publication phase.");
  }
  if (approval?.scope?.categoriesAndMetafields !== "classification metafields and additive controlled category tags approved for every active Shopify product; no Shopify product category writes") {
    approvalError("Approval does not restrict category membership to controlled tags and classification metafields.");
  }
  if (approval?.scope?.zeroImageProducts !== "delete only after a fresh live Shopify image read confirms zero product images") {
    approvalError("Approval does not limit permanent deletion to products with zero freshly verified Shopify images.");
  }
  if (approval?.scope?.prices !== "preserve") {
    approvalError("Approval does not preserve prices.");
  }
  if (approval?.scope?.newCollections !== "not approved" || approval?.scope?.collectionMergesOrArchives !== "not approved") {
    approvalError("New collection creation, merges, and archives require a separate explicit approval.");
  }
  if (process.env.SALT_CATALOG_TAXONOMY_APPROVED !== "1") {
    approvalError("Set SALT_CATALOG_TAXONOMY_APPROVED=1 only for the approved release run.");
  }
  if (process.env.SALT_CATALOG_TAXONOMY_APPROVAL_ID !== approvalId) {
    approvalError("SALT_CATALOG_TAXONOMY_APPROVAL_ID does not match the approved taxonomy manifest.");
  }

  process.stdout.write(
    `Catalog taxonomy approval verified: ${approvalId} (taxonomy ${CATALOG_TAXONOMY_VERSION}).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
