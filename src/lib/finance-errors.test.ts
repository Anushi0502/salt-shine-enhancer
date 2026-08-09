import { describe, expect, it } from "vitest";
import { formatShopifyApiError } from "../../api/finance/_shared";

describe("formatShopifyApiError", () => {
  it("handles Shopify REST error strings without calling map on them", () => {
    const message = formatShopifyApiError(
      { errors: "Invalid API key or access token (unrecognized login or wrong password)" },
      401,
    );

    expect(message).toContain("access token is invalid or expired");
    expect(message).not.toContain("body.errors?.map is not a function");
  });

  it("formats GraphQL permission errors with the missing scope", () => {
    const message = formatShopifyApiError(
      { errors: [{ message: "Access denied for shopifyPaymentsAccount field. Required access: the read_shopify_payments access scope." }] },
      200,
    );

    expect(message).toContain("Shopify Admin permission is missing");
    expect(message).toContain("read_shopify_payments");
  });

  it("handles nested object-shaped errors", () => {
    const message = formatShopifyApiError(
      { errors: { access_token: "unauthorized" } },
      403,
    );

    expect(message).toContain("access token is invalid or expired");
  });

  it("does not treat successful GraphQL data as an error", () => {
    expect(formatShopifyApiError({ data: { orders: { nodes: [] } }, extensions: { cost: {} } }, 200)).toBe("");
  });
});
