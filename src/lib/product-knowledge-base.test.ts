import { describe, expect, it } from "vitest";
import {
  buildProductKnowledgePayload,
  classifyProductKnowledge,
  PRODUCT_KNOWLEDGE_BASE_VERSION,
} from "@/lib/product-knowledge-base.js";

describe("product knowledge base", () => {
  it("classifies a product from reusable evidence and keeps false friends separate", () => {
    const lamp = classifyProductKnowledge({
      id: 1,
      handle: "usb-jellyfish-lamp",
      title: "USB Jellyfish Lamp",
      product_type: "lighting",
      tags: ["lamp", "lighting"],
    });
    const charger = classifyProductKnowledge({
      id: 2,
      handle: "lightning-charger-set",
      title: "Fast Lightning Charger Set",
      product_type: "electronics",
      tags: ["charger", "lightning"],
    });

    expect(lamp.familyId).toBe("home-lighting");
    expect(lamp.searchTerms).toContain("lamp");
    expect(charger.familyId).toBe("electronics");
    expect(charger.searchTerms).toContain("lightning");
    expect(charger.searchTerms).not.toContain("lighting");

    const lightUpToy = classifyProductKnowledge({
      id: 3,
      handle: "baby-bath-toy-led-light-up",
      title: "Cute Animals Bath Toy LED Light Up",
      product_type: "Baby Bath Toy",
      tags: ["kids toys", "baby"],
    });

    expect(lightUpToy.familyId).toBe("baby-family");
  });

  it("keeps the long tail unbounded through 100,000 unique product types", () => {
    const products = Array.from({ length: 100_000 }, (_, index) => ({
      id: index + 1,
      handle: `custom-product-${index + 1}`,
      title: `Custom Product ${index + 1}`,
      product_type: `custom type ${index + 1}`,
      tags: ["custom"],
    }));
    const payload = buildProductKnowledgePayload({ products, generatedAt: "2026-07-31T00:00:00.000Z" });

    expect(payload.version).toBe(PRODUCT_KNOWLEDGE_BASE_VERSION);
    expect(payload.totalProducts).toBe(100_000);
    expect(payload.uniqueProductTypes).toBe(100_000);
    expect(payload.types).toHaveLength(100_000);
    expect(payload.products).toHaveLength(100_000);
  }, 30_000);
});
