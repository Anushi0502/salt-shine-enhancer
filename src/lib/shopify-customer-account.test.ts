import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildShopifyCustomerAccountAuthorizationUrl,
  mapShopifyCustomerOrders,
} from "@/lib/shopify-customer-account-core";
import {
  discoverShopifyCustomerAccount,
  loadShopifyCustomerOrders,
  mapShopifyCustomerAccountSnapshot,
} from "@/lib/shopify-customer-account";

import { buildLiveShopifyBaseCandidates } from "@/lib/shopify-live-bases";

vi.mock("@/lib/shopify-live-bases", () => ({
  buildLiveShopifyBaseCandidates: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildShopifyCustomerAccountAuthorizationUrl", () => {
  it("builds a Shopify customer account authorization URL with an email hint", () => {
    const url = buildShopifyCustomerAccountAuthorizationUrl({
      authorizationEndpoint: "https://shop.example.com/oauth/authorize",
      clientId: "client_123",
      redirectUri: "https://store.example.com/account/authorize",
      state: "state_123",
      nonce: "nonce_123",
      codeChallenge: "challenge_123",
      loginHint: "customer@example.com",
      regionCountry: "US",
      locale: "en",
    });

    expect(url).toBe(
      "https://shop.example.com/oauth/authorize?scope=openid+email+customer-account-api%3Afull&client_id=client_123&response_type=code&redirect_uri=https%3A%2F%2Fstore.example.com%2Faccount%2Fauthorize&state=state_123&nonce=nonce_123&code_challenge=challenge_123&code_challenge_method=S256&login_hint=customer%40example.com&region_country=US&locale=en",
    );
  });
});

describe("mapShopifyCustomerOrders", () => {
  it("maps Shopify order data into a summary model with customer contact details", () => {
    const result = mapShopifyCustomerOrders({
      customer: {
        displayName: "Asha Patel",
        emailAddress: { emailAddress: "asha@example.com" },
        phoneNumber: { phoneNumber: "+1 317 555 0198" },
        orders: {
          edges: [
            {
              node: {
                id: "gid://shopify/Order/1024",
                name: "#1024",
                number: 1024,
                processedAt: "2026-06-10T11:45:00Z",
                fulfillmentStatus: "IN_PROGRESS",
                financialStatus: "PAID",
                phone: "+1 317 555 0198",
                statusPageUrl: "https://shop.example.com/orders/1024",
                totalPrice: {
                  amount: "84.50",
                  currencyCode: "USD",
                },
                lineItems: {
                  edges: [
                    {
                      node: {
                        title: "Reversible Tote",
                        quantity: 2,
                        variantTitle: "Natural",
                        totalPrice: {
                          amount: "42.25",
                          currencyCode: "USD",
                        },
                        image: {
                          url: "https://cdn.example.com/tote.jpg",
                          altText: "Reversible Tote",
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    expect(result.customer.displayName).toBe("Asha Patel");
    expect(result.customer.email).toBe("asha@example.com");
    expect(result.customer.phone).toBe("+1 317 555 0198");
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      name: "#1024",
      orderNumber: 1024,
      paymentStatus: "Paid",
      fulfillmentStatus: "In progress",
      totalLabel: "$84.50",
      lineItems: [
        {
          title: "Reversible Tote",
          quantity: 2,
          variantTitle: "Natural",
          totalLabel: "$42.25",
          imageUrl: "https://cdn.example.com/tote.jpg",
        },
      ],
    });
  });
});

describe("mapShopifyCustomerAccountSnapshot", () => {
  it("maps a Liquid customer account snapshot into the shared order summary", () => {
    const result = mapShopifyCustomerAccountSnapshot({
      customer: {
        first_name: "Asha",
        last_name: "Patel",
        email: "asha@example.com",
        phone: "+1 317 555 0198",
      },
      orders: [
        {
          id: 1024,
          name: "#1024",
          order_number: 1024,
          created_at: "2026-06-10T11:45:00Z",
          updated_at: "2026-06-10T12:05:00Z",
          financial_status_label: "Paid",
          fulfillment_status_label: "In progress",
          customer_order_url: "https://shop.example.com/account/orders/1024",
          phone: "+1 317 555 0198",
          total_price: "84.50",
          line_items: [
            {
              title: "Reversible Tote",
              quantity: 2,
              variant_title: "Natural",
              final_line_price: "84.50",
              image: {
                url: "https://cdn.example.com/tote.jpg",
                alt_text: "Reversible Tote",
              },
            },
          ],
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.customer.displayName).toBe("Asha Patel");
    expect(result?.customer.email).toBe("asha@example.com");
    expect(result?.customer.phone).toBe("+1 317 555 0198");
    expect(result?.orders).toHaveLength(1);
    expect(result?.orders[0]).toMatchObject({
      name: "#1024",
      orderNumber: 1024,
      paymentStatus: "Paid",
      fulfillmentStatus: "In progress",
      totalLabel: "$84.50",
      statusPageUrl: "https://shop.example.com/account/orders/1024",
      lineItems: [
        {
          title: "Reversible Tote",
          quantity: 2,
          variantTitle: "Natural",
          totalLabel: "$84.50",
          imageUrl: "https://cdn.example.com/tote.jpg",
        },
      ],
    });
  });
});

describe("discoverShopifyCustomerAccount", () => {
  it("keeps proxy bases intact when probing Shopify discovery endpoints", async () => {
    vi.mocked(buildLiveShopifyBaseCandidates).mockReturnValue([
      "http://127.0.0.1:5174/__salt_shopify",
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            authorization_endpoint: "https://shopify.com/authentication/58076594275/oauth/authorize",
            token_endpoint: "https://shopify.com/authentication/58076594275/oauth/token",
            end_session_endpoint: "https://shopify.com/authentication/58076594275/logout",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/.well-known/customer-account-api")) {
        return new Response(
          JSON.stringify({
            graphql_api: "https://shopify.com/58076594275/account/customer/api/2026-04/graphql",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const discovery = await discoverShopifyCustomerAccount();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5174/__salt_shopify/.well-known/openid-configuration",
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5174/__salt_shopify/.well-known/customer-account-api",
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(discovery.shopBaseUrl).toBe("http://127.0.0.1:5174/__salt_shopify");
  });
});

describe("loadShopifyCustomerOrders", () => {
  it("short-circuits before discovery when no customer session exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadShopifyCustomerOrders()).rejects.toThrow("Shopify customer account session is missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
