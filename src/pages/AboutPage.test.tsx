import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "@/pages/AboutPage";

vi.mock("@/lib/shopify-data", () => ({
  useAboutPage: () => ({
    data: {
      page: {
        title: "From Cart to Heart",
        bodyHtml:
          "<p>Welcome to SALT Online Store - your go to online destination for unique, high-quality products.</p><h2>Meet Courtney R. Jones</h2><p>From Senior and Living Today to Saltonline Store.</p><h3>What We Offer</h3><p><strong>Home Decor:</strong> Warm and practical home accents.</p><h3>Why Choose Us?</h3><p><strong>Free Shipping Across the USA</strong> - with no minimum purchase required.</p>",
        publishedAt: "2024-05-08T01:45:34-04:00",
        updatedAt: "2025-12-09T07:08:56-05:00",
      },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("AboutPage", () => {
  it("renders the editorial about page copy", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <AboutPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /about salt online store/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /our story/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop the catalog/i })).toBeInTheDocument();
  });
});
