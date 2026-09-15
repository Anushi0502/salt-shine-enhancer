import { describe, expect, it } from "vitest";

import {
  buildCostDraftTasks,
  buildOptionRepairTasks,
  buildProductAnomalyRepairPlan,
} from "../src/lib/catalog-product-anomaly-repair.js";

describe("product anomaly repair planning", () => {
  it("plans a dimension-label rename only from complete declared values", () => {
    const products = [{
      id: "p-1",
      handle: "tripod",
      title: "Tripod",
      options: [{ id: "o-1", name: "Color", position: 1, values: ["1800mm", "1500mm"] }],
    }];
    const issues = [
      { productId: "p-1", optionId: "o-1", reason: "color-label-length-value", suggestedName: "Length", variantId: "v-1", optionValue: "1800mm", confidence: 0.98 },
      { productId: "p-1", optionId: "o-1", reason: "color-label-length-value", suggestedName: "Length", variantId: "v-2", optionValue: "1500mm", confidence: 0.98 },
    ];
    const plan = buildOptionRepairTasks(products, issues);
    expect(plan.held).toHaveLength(0);
    expect(plan.tasks[0]).toMatchObject({ fromName: "Color", toName: "Length", status: "planned", issueCount: 2 });
  });

  it("holds a rename when the target option name would collide", () => {
    const products = [{
      id: "p-1",
      handle: "product",
      title: "Product",
      options: [
        { id: "o-1", name: "Color", values: ["10cm"] },
        { id: "o-2", name: "Size", values: ["Small"] },
      ],
    }];
    const plan = buildOptionRepairTasks(products, [{
      productId: "p-1", optionId: "o-1", reason: "color-label-length-value", suggestedName: "Size", variantId: "v-1", optionValue: "10cm",
    }]);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.held[0].repairStatus).toBe("held-option-name-collision");
  });

  it("plans a draft only when all product variants have live unit costs", () => {
    const products = [{
      id: "p-1",
      handle: "expensive-tool",
      title: "Expensive Tool",
      variants: [
        { id: "v-1", title: "Default", inventoryItem: { unitCost: { amount: "500" } } },
        { id: "v-2", title: "Large", inventoryItem: { unitCost: { amount: "520" } } },
      ],
    }];
    const plan = buildCostDraftTasks(products, [{
      productId: "p-1", handle: "expensive-tool", title: "Expensive Tool", severity: "draft", quarantineEligible: true,
      peerKey: "tool", productMedianCost: 510, peerEvidence: { peerProducts: 8, peerMedianCost: 20, peerP95Cost: 80, ratio: 25.5, delta: 490 },
    }]);
    expect(plan.held).toHaveLength(0);
    expect(plan.tasks[0].variants).toHaveLength(2);
    expect(plan.tasks[0].status).toBe("planned");
  });

  it("keeps audit summary and both repair cohorts together", () => {
    const plan = buildProductAnomalyRepairPlan([], { optionAnomalies: [], costAnomalies: [], priceAnomalies: [], priceSummary: {} });
    expect(plan.summary).toMatchObject({ productsInspected: 0, optionTasks: 0, costDraftTasks: 0 });
  });
});
