import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import {
  buildCanonicalUrl,
  normalizeCanonicalPath,
  updateCanonicalLink,
} from "@/lib/canonical-url";

afterEach(() => {
  document.head.querySelectorAll('link[rel="canonical"]').forEach((link) => link.remove());
});

describe("canonical URLs", () => {
  it("normalizes product aliases and removes query strings", () => {
    expect(normalizeCanonicalPath("/product/example-product/?utm_source=google")).toBe(
      "/products/example-product",
    );
    expect(buildCanonicalUrl("https://preview.example.com/products/example-product?variant=123")).toBe(
      "https://www.saltonlinestore.com/products/example-product",
    );
  });

  it("uses the direct child handle for nested collection routes", () => {
    expect(buildCanonicalUrl("/collections/home/creator-essentials?sort_by=best-selling")).toBe(
      "https://www.saltonlinestore.com/collections/creator-essentials",
    );
    expect(buildCanonicalUrl("/")).toBe("https://www.saltonlinestore.com/");
  });

  it("normalizes locale-prefixed product and collection routes", () => {
    expect(buildCanonicalUrl("/es/products/example-product?variant=123")).toBe(
      "https://www.saltonlinestore.com/products/example-product",
    );
    expect(buildCanonicalUrl("/es/collections/home/creator-essentials")).toBe(
      "https://www.saltonlinestore.com/collections/creator-essentials",
    );
    expect(buildCanonicalUrl("/es/collections/holiday-gifts")).toBe(
      "https://www.saltonlinestore.com/collections/gifts",
    );
    expect(buildCanonicalUrl("/collections/winter-wear")).toBe(
      "https://www.saltonlinestore.com/collections/under-50",
    );
  });

  it("keeps one canonical link when route metadata updates", () => {
    const firstCleanup = updateCanonicalLink(document, "/products/first");
    const secondCleanup = updateCanonicalLink(document, "/collections/watches?filter.v.availability=1");

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.saltonlinestore.com/collections/watches",
    );

    secondCleanup();
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.saltonlinestore.com/products/first",
    );

    firstCleanup();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("removes pre-existing duplicate canonical links", () => {
    const first = document.createElement("link");
    first.rel = "canonical";
    first.href = "https://example.com/old";
    const second = document.createElement("link");
    second.rel = "canonical";
    second.href = "https://example.com/duplicate";
    document.head.append(first, second);

    const cleanup = updateCanonicalLink(document, "/collections/anime-collectables");

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.saltonlinestore.com/collections/anime-collectables",
    );

    cleanup();
  });
});
