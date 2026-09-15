import { describe, expect, it } from "vitest";

import {
  DEFAULT_GIFT_PRODUCTS,
  GiftFinderAnswer,
  GiftFinderProduct,
  recommendGifts,
} from "./FreeGiftFinder";

const answers: GiftFinderAnswer = {
  recipient: "friend",
  occasion: "birthday",
  budget: "25-50",
  interest: "tech",
};

describe("recommendGifts", () => {
  it("returns stable, interest-aware recommendations without external data", () => {
    const firstRun = recommendGifts(answers, DEFAULT_GIFT_PRODUCTS);
    const secondRun = recommendGifts(answers, DEFAULT_GIFT_PRODUCTS);

    expect(firstRun.map(({ slug }) => slug)).toEqual(secondRun.map(({ slug }) => slug));
    expect(firstRun[0]?.slug).toBe("smart-tech-find");
    expect(firstRun).toHaveLength(3);
  });

  it("uses priority and source order to break exact-score ties", () => {
    const products: readonly GiftFinderProduct[] = [
      { slug: "second", label: "Second", priority: 1, budget: ["25-50"] },
      { slug: "first", label: "First", priority: 2, budget: ["25-50"] },
      { slug: "third", label: "Third", priority: 0, budget: ["25-50"] },
    ];

    expect(recommendGifts(answers, products).map(({ slug }) => slug)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns at most three product-like results with their original labels", () => {
    const products = Array.from({ length: 5 }, (_, index) => ({
      slug: `find-${index}`,
      label: `Find ${index}`,
    }));

    expect(recommendGifts(answers, products)).toHaveLength(3);
    expect(recommendGifts(answers, products).map(({ label }) => label)).toEqual([
      "Find 0",
      "Find 1",
      "Find 2",
    ]);
  });

  it("never recommends a known product outside the selected budget", () => {
    const products: readonly GiftFinderProduct[] = [
      { slug: "under", label: "Under", price: 19.99, budget: ["under-25"], interest: ["tech"] },
      { slug: "over", label: "Over", price: 59.99, budget: ["over-50"], interest: ["tech"] },
    ];

    expect(recommendGifts({ ...answers, budget: "under-25" }, products).map(({ slug }) => slug)).toEqual(["under"]);
    expect(recommendGifts({ ...answers, budget: "25-50" }, products)).toEqual([]);
  });
});
