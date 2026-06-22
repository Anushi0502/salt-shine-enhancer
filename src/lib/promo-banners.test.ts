import { describe, expect, it } from "vitest";
import { WEEKEND_SALE_ROUTE, isWeekendSaleRoute } from "@/lib/promo-banners";

describe("promo banners", () => {
  it("resolves the weekend sale route", () => {
    expect(WEEKEND_SALE_ROUTE).toContain("/collections/deals-sale");
    expect(WEEKEND_SALE_ROUTE).toContain("collection=under-35");
    expect(WEEKEND_SALE_ROUTE).toContain("promo=weekend-sale");
  });

  it("recognizes the weekend sale collection route", () => {
    expect(isWeekendSaleRoute("deals-sale", "under-35")).toBe(true);
    expect(isWeekendSaleRoute("deals-sale", "under-50")).toBe(false);
    expect(isWeekendSaleRoute("trending-finds", "under-35")).toBe(false);
  });
});
