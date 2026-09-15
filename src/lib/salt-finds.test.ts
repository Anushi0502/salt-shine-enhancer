import { describe, expect, it } from "vitest";

import { SALT_FIND_GUIDES } from "./salt-finds";

describe("SALT Finds guide destinations", () => {
  it("keeps the eight published GSC guides as exact internal destinations", () => {
    expect(SALT_FIND_GUIDES).toHaveLength(8);
    expect(new Set(SALT_FIND_GUIDES.map((guide) => guide.href)).size).toBe(8);
    expect(SALT_FIND_GUIDES.every((guide) => guide.href.startsWith("/pages/"))).toBe(true);
    expect(SALT_FIND_GUIDES.map((guide) => guide.href)).toEqual([
      "/pages/interactive-stem-assembly-activities-for-kids",
      "/pages/digital-circus-lunch-box-for-kids",
      "/pages/kitchen-cookware-buying-guide",
      "/pages/jeans-denim-fit-guide",
      "/pages/mobwol-watch-guide",
      "/pages/realme-buds-case-compatibility-guide",
      "/pages/salt-earbuds-buying-guide",
      "/pages/canvas-belt-sizing-style-guide",
    ]);
  });
});
