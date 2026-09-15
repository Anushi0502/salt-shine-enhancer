// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const ENV_KEYS = [
  "SALT_SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SALT_SHOPIFY_REQUEST_CONCURRENCY",
  "SALT_SHOPIFY_REQUEST_DELAY_MS",
  "SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS",
  "SALT_SHOPIFY_MAX_RETRY_DELAY_MS",
];

function configureClient(overrides = {}) {
  process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN = "test-token";
  process.env.SALT_SHOPIFY_REQUEST_CONCURRENCY = "2";
  process.env.SALT_SHOPIFY_REQUEST_DELAY_MS = "0";
  process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS = "3";
  process.env.SALT_SHOPIFY_MAX_RETRY_DELAY_MS = "1000";
  Object.assign(process.env, overrides);
  return createShopifyAdminGraphQLClient({ rootDir: process.cwd(), agentName: "client-test" });
}

function graphqlResponse(payload, status = 200, retryAfter = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => retryAfter },
    text: async () => JSON.stringify(payload),
  };
}

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

describe("Shopify GraphQL client runtime controls", () => {
  it("bounds concurrent reads and coalesces identical in-flight reads", async () => {
    const client = configureClient();
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      const variables = JSON.parse(options.body).variables;
      return graphqlResponse({ data: { node: { id: variables.id } } });
    }));

    const query = "query Product($id: ID!) { node(id: $id) { id } }";
    const results = await Promise.all([
      client.run(query, { id: "1" }),
      client.run(query, { id: "1" }),
      client.run(query, { id: "2" }),
      client.run(query, { id: "3" }),
      client.run(query, { id: "4" }),
    ]);

    expect(calls).toBe(4);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.node.id)).toEqual(["1", "1", "2", "3", "4"]);
  });

  it("honors Retry-After and preserves retry telemetry for throttled responses", async () => {
    const client = configureClient({ SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS: "2" });
    let calls = 0;
    const retryInfo = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? graphqlResponse({ errors: [{ message: "throttled" }] }, 429, "0")
        : graphqlResponse({ data: { shop: { name: "SALT" } } });
    }));

    const result = await client.run("query { shop { name } }", {}, { retryInfo });

    expect(result.shop.name).toBe("SALT");
    expect(calls).toBe(2);
    expect(retryInfo).toHaveLength(1);
    expect(retryInfo[0].delayMs).toBe(0);
  });

  it("falls back to safe bounded values for invalid runtime settings", () => {
    const client = configureClient({
      SALT_SHOPIFY_REQUEST_CONCURRENCY: "not-a-number",
      SALT_SHOPIFY_REQUEST_DELAY_MS: "not-a-number",
    });

    expect(client.requestConcurrency).toBe(4);
    expect(client.requestDelayMs).toBe(300);
  });
});
