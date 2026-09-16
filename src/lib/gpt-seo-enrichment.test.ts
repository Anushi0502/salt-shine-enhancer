import { describe, expect, it } from "vitest";

import {
  buildGptSeoPrompt,
  mergeGptSeoIntoPlan,
  validateGptSeoRecord,
} from "./gpt-seo-enrichment.js";

const product = {
  handle: "airpods-4-tpu-earbuds-case",
  title: "TPU Earbuds Case for AirPods 4",
  productType: "Earbuds Case",
  vendor: "SALT",
  tags: ["earbuds", "airpods", "case"],
  descriptionHtml: "Transparent TPU protective case for AirPods 4 earbuds.",
  variants: [{ title: "Clear", selectedOptions: [{ name: "Color", value: "Clear" }] }],
};

describe("GPT SEO evidence gate", () => {
  it("rejects the phone-case family for an earbuds case", () => {
    const result = validateGptSeoRecord(product, {
      title: "TPU Earbuds Case for AirPods 4",
      descriptionHtml: "<p>Protective case for AirPods 4 earbuds.</p>",
      seoTitle: "TPU Earbuds Case for AirPods 4",
      seoDescription: "Protect your AirPods 4 earbuds with a clear TPU case designed for a snug fit and everyday handling without changing the product family.",
      searchTerms: ["AirPods 4 case", "TPU earbuds case", "clear AirPods case"],
      category: {
        department: "Electronic Accessories",
        category: "Covers & Cases",
        subcategory: "Earbuds Cases",
        productType: "Earbuds Case",
      },
      metafields: {
        highlights: ["TPU case", "AirPods 4 earbuds", "Clear finish"],
        collectionSignal: "AirPods 4 earbuds case",
        typeAttributes: { compatibility: "AirPods 4", color: "Clear" },
      },
    });
    expect(result.accepted).toBe(true);
    const wrong = validateGptSeoRecord(product, {
      title: "Protective Phone Case",
      descriptionHtml: "<p>Protective phone case for everyday use.</p>",
      seoTitle: "Protective Phone Case",
      seoDescription: "Protective phone case for daily use with a slim profile and practical coverage for compatible devices and everyday handling.",
      searchTerms: ["phone case"],
    });
    expect(wrong.accepted).toBe(false);
    expect(wrong.issues).toContain("unsupported-family:/\\bphone\\s+case\\b/i");
  });

  it("rejects generic filler and unsupported markup", () => {
    const result = validateGptSeoRecord(product, {
      title: "TPU Earbuds Case for AirPods 4",
      descriptionHtml: "<p>Use it only for the stated task.</p><script>alert(1)</script>",
      seoTitle: "TPU Earbuds Case for AirPods 4",
      seoDescription: "Confirmed product facts help shoppers compare this specific product type for everyday value and general use in a practical way.",
      searchTerms: ["AirPods 4 case"],
    });
    expect(result.accepted).toBe(false);
    expect(result.issues).toContain("generic-copy");
    expect(result.issues).toContain("unsupported-html:script");
  });

  it("recognizes hyphenated family evidence without weakening the family gate", () => {
    const travelBag = validateGptSeoRecord({
      handle: "travel-bag-cosmetics-backpack",
      title: "Travel Bag Cosmetics Backpack",
      productType: "backpack",
      tags: ["travel-bag"],
      descriptionHtml: "Travel bag cosmetics backpack for travel and fitness.",
    }, {
      title: "Travel Bag Cosmetics Backpack",
      descriptionHtml: "<p>Travel bag cosmetics backpack for travel and fitness.</p>",
      seoTitle: "Travel Bag Cosmetics Backpack",
      seoDescription: "Travel Bag Cosmetics Backpack is listed for travel and fitness use, with supplied details and options to review before ordering.",
      searchTerms: ["travel bag", "cosmetics backpack", "fitness bag"],
      category: { department: "Camping & Travel Essentials", category: "Travel Essentials", subcategory: "Travel Bags & Luggage", productType: "Travel Bag" },
      metafields: { highlights: ["Travel bag", "Cosmetics backpack"], collectionSignal: "Travel Essentials > Travel Bags & Luggage", typeAttributes: {} },
    });
    expect(travelBag.accepted).toBe(true);
  });

  it("merges only accepted records into the existing Shopify plan", () => {
    const plan = {
      products: [{ handle: product.handle, desiredProductInput: { seo: {} } }],
    };
    const enrichment = {
      model: "test-model",
      records: [{
        handle: product.handle,
        accepted: true,
        record: {
          title: "TPU Earbuds Case for AirPods 4",
          descriptionHtml: "<p>Clear TPU case for AirPods 4 earbuds.</p>",
          seoTitle: "TPU Earbuds Case for AirPods 4",
          seoDescription: "Clear TPU protection for AirPods 4 earbuds, with a practical case design for everyday handling and a product-specific fit.",
        },
      }],
    };
    const merged = mergeGptSeoIntoPlan(plan, enrichment, { scope: "all-products" });
    expect(merged.gptSeo.applied).toBe(1);
    expect(merged.products[0].desiredProductInput.seo.title).toBe("TPU Earbuds Case for AirPods 4");
  });

  it("includes the complete evidence contract in the prompt", () => {
    const prompt = buildGptSeoPrompt(product);
    expect(prompt).toContain("Do not change the product family");
    expect(prompt).toContain("AirPods 4");
    expect(prompt).toContain("descriptionHtml");
  });
});
