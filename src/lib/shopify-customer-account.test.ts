import { describe, expect, it } from "vitest";

import {
  buildShopifyCustomerAccountAuthorizationUrl,
  mapShopifyCustomerOrders,
} from "@/lib/shopify-customer-account-core";

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
