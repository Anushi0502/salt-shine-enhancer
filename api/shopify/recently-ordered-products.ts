import { buildRecentlyOrderedProductsPayload } from "../../src/lib/recently-ordered-products-core.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const query = /* GraphQL */ `
  query RecentlyOrderedProducts {
    orders(first: 100, sortKey: CREATED_AT, reverse: true) {
      nodes {
        cancelledAt
        lineItems(first: 100) {
          nodes {
            title
            product {
              id
              title
              handle
              featuredMedia { preview { image { url altText } } }
            }
            variant { price image { url altText } }
          }
        }
      }
    }
  }
`;

type CachedFeed = { expiresAt: number; payload: unknown };
let cachedFeed: CachedFeed | null = null;

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json(cachedFeed.payload);
    return;
  }

  const token =
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN ||
    "";
  const shopBase = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";

  if (!token) {
    res.status(503).json({ error: "Shopify Admin connection is not configured" });
    return;
  }

  const response = await fetch(`${new URL(shopBase).origin}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query }),
  });
  const body: any = await response.json();

  if (!response.ok || body.errors?.length) {
    res.status(502).json({ error: "Unable to load Shopify order products" });
    return;
  }

  const payload = buildRecentlyOrderedProductsPayload(body.data?.orders, {
    limit: 4,
    minPriceExclusive: 34,
  });
  cachedFeed = { expiresAt: now + CACHE_TTL_MS, payload };
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).json(payload);
}
