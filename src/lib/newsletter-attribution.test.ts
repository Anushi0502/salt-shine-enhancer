import { describe, expect, it } from "vitest";
import { getNewsletterTags } from "./newsletter-attribution";

describe("newsletter attribution", () => {
  it("keeps the default newsletter tag when no campaign is present", () => {
    expect(getNewsletterTags("")).toBe("newsletter");
  });

  it("preserves the approved UTM campaign fields as safe Shopify tags", () => {
    expect(
      getNewsletterTags(
        "?utm_source=google&utm_medium=organic&utm_campaign=gsc-interactive-stem-assemblies&utm_content=collection-cta",
      ),
    ).toBe(
      "newsletter,source-google,medium-organic,campaign-gsc-interactive-stem-assemblies,content-collection-cta",
    );
  });

  it("normalizes unsafe values without carrying raw query characters", () => {
    expect(getNewsletterTags("?utm_source=Google%20Ads%2FSearch&utm_campaign=A%26B%20Test")).toBe(
      "newsletter,source-google-ads-search,campaign-a-b-test",
    );
  });
});
