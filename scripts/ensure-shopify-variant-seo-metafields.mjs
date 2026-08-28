#!/usr/bin/env node

import { rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { GOOGLE_VARIANT_METAFIELD_DEFINITIONS } from "../src/lib/shopify-variant-google-metafields.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputPath = resolve(rootDir, "output", "shopify-variant-seo-metafield-definitions.json");
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "variant-seo-metafield-definitions" });

const QUERY = /* GraphQL */ `
  query VariantSeoMetafieldDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(first: $first, ownerType: PRODUCTVARIANT, after: $after) {
      nodes { id name namespace key ownerType type { name } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CREATE = /* GraphQL */ `
  mutation CreateVariantSeoMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id name namespace key ownerType type { name } }
      userErrors { field message code }
    }
  }
`;

async function writeReportSafely(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await writeFile(temporaryPath, serialized, "utf8");
      await rename(temporaryPath, outputPath);
      return;
    } catch (error) {
      lastError = error;
      await rm(temporaryPath, { force: true }).catch(() => {});
      if (attempt === 4 || !/unknown system error -11|eagain|temporar/i.test(String(error?.message || error))) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  throw lastError;
}

async function readDefinitions() {
  const definitions = [];
  let after = null;
  do {
    const payload = await client.run(QUERY, { first: 250, after }, { operation: "read variant SEO metafield definitions" });
    const connection = payload?.metafieldDefinitions;
    definitions.push(...(connection?.nodes || []));
    after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);
  return definitions;
}

async function main() {
  const live = await readDefinitions();
  const byKey = new Map(live.map((entry) => [`${entry.namespace}.${entry.key}`, entry]));
  const created = [];
  const existing = [];
  for (const expected of GOOGLE_VARIANT_METAFIELD_DEFINITIONS.filter((entry) => entry.namespace === "salt-seo")) {
    const key = `${expected.namespace}.${expected.key}`;
    const current = byKey.get(key);
    if (current) {
      if (current.ownerType !== "PRODUCTVARIANT" || current.type?.name !== expected.type) {
        throw new Error(`Variant SEO metafield definition ${key} has incompatible type ${current.ownerType}/${current.type?.name}`);
      }
      existing.push(key);
      continue;
    }
    const payload = await client.run(CREATE, {
      definition: {
        name: expected.name,
        namespace: expected.namespace,
        key: expected.key,
        description: expected.id === "variantSeoTitle"
          ? "SALT-generated title for the selected product variant."
          : "SALT-generated description for the selected product variant.",
        type: expected.type,
        ownerType: "PRODUCTVARIANT",
        access: { storefront: "PUBLIC_READ" },
        pin: true,
      },
    }, { allowMutations: true, operation: `create variant SEO metafield definition ${key}` });
    const result = payload?.metafieldDefinitionCreate;
    if (result?.userErrors?.length) {
      throw new Error(`Failed to create ${key}: ${result.userErrors.map((error) => error.message).join(" | ")}`);
    }
    created.push(result?.createdDefinition || { namespace: expected.namespace, key: expected.key });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    ownerType: "PRODUCTVARIANT",
    required: GOOGLE_VARIANT_METAFIELD_DEFINITIONS.filter((entry) => entry.namespace === "salt-seo").map(({ id, name, namespace, key, type }) => ({ id, name, namespace, key, type })),
    existing,
    created,
  };
  await writeReportSafely(report);
  process.stdout.write(`Variant SEO definitions ready: ${existing.length} existing, ${created.length} created.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
