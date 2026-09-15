import { afterEach, describe, expect, it } from "vitest";

import { assertReleaseModePrerequisites, buildReleaseSteps } from "./release.mjs";

const originalMode = process.env.SALT_RELEASE_SEO_MODE;
const originalScope = process.env.SALT_RELEASE_SEO_SCOPE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.SALT_RELEASE_SEO_MODE;
  else process.env.SALT_RELEASE_SEO_MODE = originalMode;
  if (originalScope === undefined) delete process.env.SALT_RELEASE_SEO_SCOPE;
  else process.env.SALT_RELEASE_SEO_SCOPE = originalScope;
});

describe("catalog release SEO mode graph", () => {
  it("blocks GPT mode before the release preflight when the provider key is absent", () => {
    expect(() => assertReleaseModePrerequisites({ seoMode: "gpt" }, { SALT_GPT_SEO_PROVIDER: "api" })).toThrow(
      /requires OPENAI_API_KEY/,
    );
    expect(() => assertReleaseModePrerequisites({ seoMode: "gpt" }, { SALT_GPT_SEO_PROVIDER: "applescript" })).not.toThrow();
    expect(() => assertReleaseModePrerequisites({ seoMode: "deterministic" }, {})).not.toThrow();
  });

  it("uses one governed graph for manual and scheduled catalog releases", () => {
    process.env.SALT_RELEASE_SEO_MODE = "deterministic";
    process.env.SALT_RELEASE_SEO_SCOPE = "all-products";
    const full = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "catalog" });
    const daily = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "daily" });
    expect(daily.map((step) => step.label)).toEqual(full.map((step) => step.label));
    expect(daily.map((step) => step.args)).toEqual(full.map((step) => step.args));
  });

  it("keeps deterministic release free of provider work", () => {
    process.env.SALT_RELEASE_SEO_MODE = "deterministic";
    process.env.SALT_RELEASE_SEO_SCOPE = "all-products";
    const steps = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "daily" });
    expect(steps.some((step) => step.label.includes("GPT SEO"))).toBe(false);
    expect(steps.some((step) => step.label.includes("product option and unit-cost anomaly repair"))).toBe(true);
  });

  it("adds a 500-product GPT preparation checkpoint only when requested", () => {
    process.env.SALT_RELEASE_SEO_MODE = "gpt";
    process.env.SALT_RELEASE_SEO_SCOPE = "new-products";
    const steps = buildReleaseSteps({ rootDir: "/tmp/salt-release-test", includeMobile: false, profile: "catalog" });
    const step = steps.find((entry) => entry.label === "Prepare GPT SEO enrichment in 500-product checkpoints");
    expect(step?.args).toEqual([
      "run",
      "catalog:seo:gpt:prepare",
      "--",
      "--scope",
      "new-products",
      "--batch-size",
      "500",
    ]);
    expect(steps.indexOf(step)).toBeLessThan(steps.findIndex((entry) => entry.label === "Reconcile and verify Shopify SEO/product fields"));
    const metafieldStep = steps.find((entry) => entry.label === "Apply and verify GPT product-type metafields in 500-product checkpoints");
    const backfillStep = steps.findIndex((entry) => entry.label === "Apply Shopify merchandising metafield backfill after catalog boundary changes");
    const refreshAfterBackfill = steps.findIndex((entry) => entry.label === "Refresh Shopify data after merchandising backfill");
    expect(metafieldStep?.args).toEqual(["run", "shopify:gpt-seo:metafields:apply"]);
    expect(steps.indexOf(metafieldStep)).toBeGreaterThan(backfillStep);
    expect(steps.indexOf(metafieldStep)).toBeGreaterThan(refreshAfterBackfill);
    expect(steps.indexOf(metafieldStep)).toBeLessThan(steps.findIndex((entry) => entry.label === "Verify every active product has product-specific SEO and metafields"));
  });
});
