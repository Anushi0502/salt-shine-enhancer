import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SeoMetadata from "./SeoMetadata";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

describe("SeoMetadata", () => {
  it("keeps the published STEM page indexable", () => {
    window.history.pushState({}, "", "/pages/interactive-stem-assembly-activities-for-kids");

    render(
      <SeoMetadata
        title="Interactive STEM Assembly Activities for Kids | SALT"
        description="Explore educational assembly toys and science-inspired build activities for kids."
        canonicalPath="/pages/interactive-stem-assembly-activities-for-kids"
      />,
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps the lunch-box landing page indexable", () => {
    window.history.pushState({}, "", "/pages/digital-circus-lunch-box-for-kids");

    render(
      <SeoMetadata
        title="Amazing Digital Circus Lunch Box for Kids | SALT"
        description="Explore SALT's Amazing Digital Circus lunch box listing for school, picnic, camping, and travel use."
        canonicalPath="/pages/digital-circus-lunch-box-for-kids"
      />,
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps the cookware guide indexable", () => {
    window.history.pushState({}, "", "/pages/kitchen-cookware-buying-guide");

    render(
      <SeoMetadata
        title="Kitchen & Cookware Buying Guide | SALT"
        description="Use SALT's Kitchen & Cookware collection to compare practical kitchen helpers by task."
        canonicalPath="/pages/kitchen-cookware-buying-guide"
      />,
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps the jeans guide indexable", () => {
    window.history.pushState({}, "", "/pages/jeans-denim-fit-guide");

    render(
      <SeoMetadata
        title="Jeans & Denim Fit Guide | SALT"
        description="Compare the live SALT Jeans collection by current product-title style signals."
        canonicalPath="/pages/jeans-denim-fit-guide"
      />,
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps the Mobwol watch guide indexable", () => {
    window.history.pushState({}, "", "/pages/mobwol-watch-guide");

    render(
      <SeoMetadata
        title="Mobwol 40mm Quartz Watch Guide | SALT"
        description="Compare the SALT Mobwol-handle 40mm quartz watch with current watch listings."
        canonicalPath="/pages/mobwol-watch-guide"
      />,
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps the remaining free organic guide routes indexable", () => {
    const pages = [
      ["/pages/realme-buds-case-compatibility-guide", "Realme Buds Case Compatibility Guide | SALT"],
      ["/pages/salt-earbuds-buying-guide", "Earbuds Buying Guide: Cases, Tips & Wireless Earbuds | SALT"],
      ["/pages/canvas-belt-sizing-style-guide", "Canvas Belt Sizing & Style Guide | SALT"],
    ] as const;

    for (const [path, title] of pages) {
      cleanup();
      document.head.innerHTML = "";
      window.history.pushState({}, "", path);
      render(<SeoMetadata title={title} description="SALT buying guide" canonicalPath={path} />);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
      );
      expect(document.querySelector('meta[name="googlebot"]')?.getAttribute("content")).toBe(
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
      );
    }
  });

  it("keeps product review utility routes out of the index", () => {
    window.history.pushState({}, "", "/products/example-product/reviews");

    render(<SeoMetadata title="Reviews | SALT" canonicalPath="/products/example-product" />);

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
  });
});
