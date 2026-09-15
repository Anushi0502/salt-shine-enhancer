import { describe, expect, it } from "vitest";

import { toGiftFinderProduct } from "./gift-finder-catalog";

describe("toGiftFinderProduct", () => {
  it("maps live product signals to a deterministic linked recommendation", () => {
    expect(
      toGiftFinderProduct({
        id: 42,
        title: "Realme Buds Air 8 Wireless Earbuds",
        handle: "realme-buds-air-8",
        price: 39.99,
      }),
    ).toMatchObject({
      slug: "realme-buds-air-8",
      href: "/products/realme-buds-air-8",
      budget: ["25-50"],
      interest: ["tech"],
    });
  });

  it("keeps broad everyday finds available for every supported gift context", () => {
    const product = toGiftFinderProduct({ id: 7, title: "Ceramic Home Storage", handle: "storage", price: 12 });

    expect(product.recipient).toEqual(["partner", "family", "friend", "self"]);
    expect(product.occasion).toEqual(["birthday", "holiday", "thank-you", "just-because"]);
    expect(product.interest).toEqual(["home"]);
  });
});

