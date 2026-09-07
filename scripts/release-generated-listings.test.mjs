import { describe, expect, it } from "vitest";

import { buildReleaseSteps } from "./release.mjs";

describe("release generated listing payload policy", () => {
  it("skips product/search/home payload generation during catalog releases", () => {
    const steps = buildReleaseSteps({ profile: "catalog", includeMobile: false });
    const syncSteps = steps.filter((step) => step.args?.[0] === "scripts/sync-shopify-data.mjs");

    expect(syncSteps.length).toBeGreaterThan(0);
    expect(syncSteps.every((step) => step.args.includes("--skip-generated-listings"))).toBe(true);

    const commandArguments = steps.flatMap((step) => step.args || []);
    expect(commandArguments).not.toContain("catalog:artifacts");
    expect(commandArguments).not.toContain("scripts/build-product-search-index.mjs");
    expect(commandArguments).not.toContain("scripts/build-home-featured-products.mjs");
    expect(commandArguments).not.toContain("scripts/build-home-collection-products.mjs");
  });

  it("keeps the frozen product release free of catalog listing sync stages", () => {
    const steps = buildReleaseSteps({ profile: "products", includeMobile: false });

    expect(steps.some((step) => step.args?.[0] === "scripts/sync-shopify-data.mjs")).toBe(false);
    expect(steps.some((step) => step.args?.includes("sync:data"))).toBe(false);
  });
});
