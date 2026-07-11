import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getEditorialPageContent } from "@/lib/editorial-pages";
import { RESOURCE_HUB_GUIDES, RESOURCE_HUB_HUB_FEATURED_PRODUCTS } from "@/lib/resource-hub-data";
import {
  buildResourceRoute,
  buildResourceTopicRoute,
  getResourceByHandle,
  getResourceTopicByHandle,
} from "@/lib/site-navigation";

type ShopifyProductsPayload = {
  products: Array<{
    id: number;
    handle: string;
  }>;
};

type ShopifyCollectionProductsPayload = {
  collections: Record<
    string,
    {
      title: string;
      productIds: number[];
    }
  >;
};

const readJson = <T,>(relativePath: string): T => {
  const absolutePath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
};

const productsPayload = readJson<ShopifyProductsPayload>("public/data/products.json");
const collectionProductsPayload = readJson<ShopifyCollectionProductsPayload>("public/data/collection-products.json");

const productByHandle = new Map(productsPayload.products.map((product) => [product.handle, product]));
const bestSellerIds = new Set(collectionProductsPayload.collections["appplaza-best-sellers"]?.productIds || []);

const productCollectionsById = new Map<number, Set<string>>();
for (const [collectionHandle, collection] of Object.entries(collectionProductsPayload.collections)) {
  for (const productId of collection.productIds) {
    if (!productCollectionsById.has(productId)) {
      productCollectionsById.set(productId, new Set());
    }

    productCollectionsById.get(productId)?.add(collectionHandle);
  }
}

const ALLOWED_COLLECTIONS: Record<string, Set<string>> = {
  "Senior Living Guides": new Set(["books", "gifts", "medical-accessories", "gloves", "home-decor"]),
  "Home & Living": new Set(["home-decor", "cookware", "tools", "shopping-bags-jute-bags"]),
  "Lifestyle & Wellness": new Set(["books", "personal-care", "medical-accessories", "gloves", "home-decor"]),
  "Gift Guides": new Set(["books", "gifts", "home-decor", "cookware", "unique-products", "personal-care", "medical-accessories", "tools"]),
  "Home Safety & Organization": new Set([
    "home-decor",
    "medical-accessories",
    "storage-organization",
    "shopping-bags-jute-bags",
    "tools",
    "cookware",
    "travel-outdoor",
  ]),
  "Family & Legacy": new Set(["books", "gifts", "medical-accessories"]),
  "Pet & Home Life": new Set(["pet-assocerries", "gifts", "home-decor", "travel-outdoor", "tools"]),
};

function expectCuratedProduct(handle: string, allowedCollections: Set<string>) {
  const product = productByHandle.get(handle);
  expect(product, `expected Shopify export to include ${handle}`).toBeTruthy();
  if (!product) {
    return;
  }

  if (bestSellerIds.has(product.id)) {
    return;
  }

  const memberships = productCollectionsById.get(product.id) || new Set<string>();
  const isAllowed = [...memberships].some((collectionHandle) => allowedCollections.has(collectionHandle));
  expect(
    isAllowed,
    `${product.handle} should belong to a best-seller or topical collection set`,
  ).toBe(true);
}

describe("resource hub content", () => {
  it("keeps the expected hub hierarchy and route helpers in sync", () => {
    expect(RESOURCE_HUB_GUIDES).toHaveLength(7);
    expect(RESOURCE_HUB_GUIDES.flatMap((guide) => guide.topics)).toHaveLength(27);

    const guide = getResourceByHandle("senior-living-guides");
    expect(guide?.title).toBe("Senior Living Guides");

    const topic = getResourceTopicByHandle("senior-living-guides", "home-safety-tips");
    expect(topic?.title).toBe("Home Safety Tips");
    expect(buildResourceRoute("senior-living-guides")).toBe("/resources/senior-living-guides");
    expect(buildResourceTopicRoute("senior-living-guides", "home-safety-tips")).toBe(
      "/resources/senior-living-guides/home-safety-tips",
    );
  });

  it("keeps every featured resource product present in the Shopify export", () => {
    expect(RESOURCE_HUB_HUB_FEATURED_PRODUCTS).toHaveLength(3);

    for (const product of RESOURCE_HUB_HUB_FEATURED_PRODUCTS) {
      expectCuratedProduct(product.handle, new Set(["books", "gifts", "home-decor", "medical-accessories"]));
    }

    for (const guide of RESOURCE_HUB_GUIDES) {
      const guideAllowedCollections = ALLOWED_COLLECTIONS[guide.title];
      expect(guideAllowedCollections, `missing allowed collections for ${guide.title}`).toBeTruthy();

      for (const product of guide.featuredProducts) {
        expectCuratedProduct(product.handle, guideAllowedCollections || new Set());
      }

      for (const topic of guide.topics) {
        for (const product of topic.featuredProducts) {
          expectCuratedProduct(product.handle, guideAllowedCollections || new Set());
        }
      }
    }
  });

  it("scopes topic FAQs to the parent category", () => {
    const page = getEditorialPageContent("senior-living-guides/home-safety-tips");

    expect(page?.faqs?.length).toBeGreaterThan(0);
    expect(page?.faqs?.every((faq) => !faq.question.includes("Home Safety Tips"))).toBe(true);
    expect(page?.faqs?.some((faq) => faq.question.includes("Senior Living Guides"))).toBe(true);
  });
});
