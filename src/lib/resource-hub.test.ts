import { describe, expect, it } from "vitest";
import { getEditorialPageContent } from "@/lib/editorial-pages";
import { RESOURCE_HUB_GUIDES, RESOURCE_HUB_HUB_FEATURED_PRODUCTS } from "@/lib/resource-hub-data";
import { SALT_FINDS_WEEK_01 } from "@/lib/salt-brand";
import {
  buildResourceRoute,
  buildResourceTopicRoute,
  getResourceByHandle,
  getResourceTopicByHandle,
} from "@/lib/site-navigation";
function expectValidFeaturedHandle(handle: string) {
  expect(handle).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(handle.length).toBeGreaterThan(4);
}

describe("resource hub content", () => {
  it("keeps the expected hub hierarchy and route helpers in sync", () => {
    expect(RESOURCE_HUB_GUIDES).toHaveLength(7);
    expect(RESOURCE_HUB_GUIDES.flatMap((guide) => guide.topics)).toHaveLength(28);

    const guide = getResourceByHandle("senior-living-guides");
    expect(guide?.title).toBe("Senior Living Guides");

    const topic = getResourceTopicByHandle("senior-living-guides", "home-safety-tips");
    expect(topic?.title).toBe("Home Safety Tips");
    expect(buildResourceRoute("senior-living-guides")).toBe(
      "/pages/resources?resource=guide&handle=senior-living-guides",
    );
    expect(buildResourceTopicRoute("senior-living-guides", "home-safety-tips")).toBe(
      "/pages/resources?resource=guide&handle=senior-living-guides%2Fhome-safety-tips",
    );
  });

  it("keeps every featured resource product as a valid live Shopify handle", () => {
    expect(RESOURCE_HUB_HUB_FEATURED_PRODUCTS).toHaveLength(3);

    for (const product of RESOURCE_HUB_HUB_FEATURED_PRODUCTS) {
      expectValidFeaturedHandle(product.handle);
    }

    for (const guide of RESOURCE_HUB_GUIDES) {
      for (const product of guide.featuredProducts) {
        expectValidFeaturedHandle(product.handle);
      }

      for (const topic of guide.topics) {
        for (const product of topic.featuredProducts) {
          expectValidFeaturedHandle(product.handle);
        }
      }
    }
  });

  it("gives every resource route an answer-first block and page-specific FAQs", () => {
    const page = getEditorialPageContent("senior-living-guides/home-safety-tips");

    expect(page?.answerBlock?.question).toContain("home safety tips");
    expect(page?.answerBlock?.answer).toContain("safer rooms");
    expect(page?.answerBlock?.usefulFor).toContain("home safety tips");
    expect(page?.answerBlock?.nextStep).toContain("Home Decor & Lighting");
    expect(page?.answerBlock?.takeaways).toHaveLength(3);
    expect(page?.answerBlock?.queryPrompts).toHaveLength(3);
    expect(page?.answerBlock?.decisionSteps).toHaveLength(3);
    expect(page?.answerBlock?.queryPrompts?.[0]).toBe("What are practical home safety tips?");
    expect(page?.faqs?.length).toBeGreaterThan(0);
    expect(page?.faqs?.some((faq) => faq.question.includes("Home Safety Tips"))).toBe(true);
    expect(page?.faqs?.some((faq) => faq.question.includes("Senior Living Guides"))).toBe(true);
  });

  it("keeps every guide and topic ready for answer-first extraction", () => {
    const handles = RESOURCE_HUB_GUIDES.flatMap((guide) => [
      guide.handle,
      ...guide.topics.map((topic) => `${guide.handle}/${topic.handle}`),
    ]);

    for (const handle of handles) {
      const page = getEditorialPageContent(handle);
      expect(page?.answerBlock?.question).toBeTruthy();
      expect(page?.answerBlock?.answer).toBeTruthy();
      expect(page?.answerBlock?.usefulFor).toBeTruthy();
      expect(page?.answerBlock?.nextStep).toBeTruthy();
      expect(page?.answerBlock?.takeaways?.length).toBeGreaterThanOrEqual(3);
      expect(page?.answerBlock?.queryPrompts?.length).toBeGreaterThanOrEqual(3);
      expect(page?.answerBlock?.decisionSteps?.length).toBe(3);
      expect(page?.faqs?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("adds a direct answer surface to the broader editorial storefront", () => {
    for (const handle of ["about-us", "collections", "faq", "interactive-stem-assembly-activities-for-kids"]) {
      const page = getEditorialPageContent(handle);

      expect(page?.answerBlock?.question).toBeTruthy();
      expect(page?.answerBlock?.answer).toBeTruthy();
      expect(page?.answerBlock?.takeaways?.length).toBeGreaterThanOrEqual(1);
      expect(page?.answerBlock?.queryPrompts?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("publishes the Phase 3 SALT Finds asset with live catalog anchors", () => {
    const handle = `gift-guides/${SALT_FINDS_WEEK_01.slug}`;
    const page = getEditorialPageContent(handle);
    const hub = getEditorialPageContent("resources");

    expect(page?.title).toBe(SALT_FINDS_WEEK_01.title);
    expect(page?.answerBlock?.question).toBe(
      "How do I choose a practical gift for someone who has everything?",
    );
    expect(page?.answerBlock?.decisionSteps).toHaveLength(3);
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual(
      [...SALT_FINDS_WEEK_01.featuredProducts],
    );
    expect(page?.actions?.some((action) => action.to === "/collections/gifts")).toBe(true);
    expect(hub?.cards?.some((card) => card.to === SALT_FINDS_WEEK_01.route)).toBe(true);
  });

  it("keeps the GSC STEM landing page tied to the verified live products", () => {
    const page = getEditorialPageContent("interactive-stem-assembly-activities-for-kids");

    expect(page?.seoTitle).toBe("Interactive STEM Assembly Activities for Kids | SALT");
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual([
      "q0kb-kids-educational-wooden-diy-carousel-toy-for-science-experiment-physics-balancing-and-creative-assembly-play-development",
      "childrens-science-and-education-and-educational-assembly-toys-hand-assembled-models-decorative-models-childrens-diy-gifts",
    ]);
    expect(page?.actions?.some((action) => action.to === "/collections/kids-toys-games")).toBe(true);
  });

  it("keeps the STEM landing page discoverable from the resource hub", () => {
    const page = getEditorialPageContent("resources");

    expect(page?.cards?.some((card) => card.to === "/pages/interactive-stem-assembly-activities-for-kids")).toBe(true);
  });

  it("keeps the lunch-box landing page tied to the verified live product", () => {
    const page = getEditorialPageContent("digital-circus-lunch-box-for-kids");

    expect(page?.seoTitle).toBe("Amazing Digital Circus Lunch Box for Kids | SALT");
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual([
      "the-amazing-digital-circus-lunch-box-for-kids-school-cute-food-storage-containers-boys-girls-picnic-bento-children-birthday-gift",
    ]);
    expect(page?.actions?.some((action) => action.to === "/collections/lunch-boxes")).toBe(true);
  });

  it("keeps the lunch-box landing page discoverable from the resource hub", () => {
    const page = getEditorialPageContent("resources");

    expect(page?.cards?.some((card) => card.to === "/pages/digital-circus-lunch-box-for-kids")).toBe(true);
  });

  it("keeps the cookware guide tied to verified live kitchen products", () => {
    const page = getEditorialPageContent("kitchen-cookware-buying-guide");

    expect(page?.seoTitle).toBe("Kitchen & Cookware Buying Guide | SALT");
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual([
      "chestnut-opener-stainless-steel-chestnut-peeler-cross-knife-for-peeling-and-shelling-for-home-use",
      "500-900ml-hand-chopper-manual-rope-food-processor-silcer-shredder-salad-maker-garlic-onion-cutter-kitchen-tool-accessories",
      "masher-ricerpress-mashed-potatoes-stainless-steel-crushing-puree-fruit-vegetable-squeezerjuicer-press-maker-kitchen-tools-1",
      "1-2pcs-manual-portable-garlic-crusher-twist-kitchen-gadget-for-crushing-garlic-and-ginger-easy-to-use-and-clean",
    ]);
    expect(page?.actions?.some((action) => action.to === "/collections/cookware")).toBe(true);
  });

  it("keeps the cookware guide discoverable from the resource hub", () => {
    const page = getEditorialPageContent("resources");

    expect(page?.cards?.some((card) => card.to === "/pages/kitchen-cookware-buying-guide")).toBe(true);
  });

  it("keeps the jeans guide tied to verified live denim products", () => {
    const page = getEditorialPageContent("jeans-denim-fit-guide");

    expect(page?.seoTitle).toBe("Jeans & Denim Fit Guide | SALT");
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual([
      "mens-jeans-black-denim-pants-straight-leg-comfort-mid-waist-white-embroidery-casual-streetwear-spring-slim-fit-trousers",
      "women-jegging-jeans-high-waisted-fashion-denim-pants-good-stretchy-streetwear-running-sports-casual-body-shaping-pants-legging",
      "mens-jeans-patch-lightning-jeans-mens-loose-jeans-worn-out-jeans",
      "jeans-men-mens-flared-jeans-boot-cut-leg-flared-male-designer-classic-denim-jeans-high-waist-stretch-loose-flared-blue-jeans",
    ]);
    expect(page?.actions?.some((action) => action.to === "/collections/jeans")).toBe(true);
  });

  it("keeps the jeans guide discoverable from the resource hub", () => {
    const page = getEditorialPageContent("resources");

    expect(page?.cards?.some((card) => card.to === "/pages/jeans-denim-fit-guide")).toBe(true);
  });

  it("keeps the Mobwol watch guide tied to verified live watch products", () => {
    const page = getEditorialPageContent("mobwol-watch-guide");

    expect(page?.seoTitle).toBe("Mobwol 40mm Quartz Watch Guide | SALT");
    expect(page?.featuredProducts?.map((product) => product.handle)).toEqual([
      "mobwol-2026-new-mens-watches-40mm-luxury-quartz-watch-men-sport-wear-resistant-glass-3bar-waterproof-stainless-steel",
      "high-end-waterproof-automatic-mechanical-watch-with-genuine-leather-strap-and-stainless-steel-transparent-back-cover",
      "2026-new-sports-smart-watch-1-39-hd-screen-with-bluetooth-call-ip68-waterproof-health-monitoring-smartwatch-for-android-and-ios",
      "women-quartz-watches-for-women-fashion-ladies-watches-with-simple-dial-easy-read-numerals-thin-bracelet-casual-wristwatch-gift",
    ]);
    expect(page?.actions?.some((action) => action.to === "/collections/watches")).toBe(true);
  });

  it("keeps the Mobwol watch guide discoverable from the resource hub", () => {
    const page = getEditorialPageContent("resources");

    expect(page?.cards?.some((card) => card.to === "/pages/mobwol-watch-guide")).toBe(true);
  });

  it("keeps the remaining free GSC guides tied to live product routes", () => {
    const expected = [
      {
        handle: "realme-buds-case-compatibility-guide",
        route: "/pages/realme-buds-case-compatibility-guide",
        collection: "/collections/audio",
      },
      {
        handle: "salt-earbuds-buying-guide",
        route: "/pages/salt-earbuds-buying-guide",
        collection: "/collections/audio",
      },
      {
        handle: "canvas-belt-sizing-style-guide",
        route: "/pages/canvas-belt-sizing-style-guide",
        collection: "/collections/mens-accessories",
      },
    ];
    const hub = getEditorialPageContent("resources");

    for (const entry of expected) {
      const page = getEditorialPageContent(entry.handle);
      expect(page?.featuredProducts?.length).toBeGreaterThan(0);
      expect(page?.actions?.some((action) => action.to === entry.collection)).toBe(true);
      expect(hub?.cards?.some((card) => card.to === entry.route)).toBe(true);
    }
  });
});
