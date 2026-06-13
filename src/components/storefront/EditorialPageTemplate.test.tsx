import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import EditorialPageTemplate from "@/components/storefront/EditorialPageTemplate";
import type { EditorialPageCopy } from "@/content/pages/types";

const sampleCopy: EditorialPageCopy = {
  eyebrow: "About SALT",
  title: "About SALT Online Store",
  summary:
    "A calmer storefront for useful products, clearer choices, and a warmer path from discovery to checkout.",
  chips: ["Founder-led", "Curated assortment", "Practical gifting"],
  sections: [
    {
      id: "our-story",
      kind: "rich",
      title: "Our Story",
      body: [
        "SALT started with a simple belief: everyday shopping should feel organized, honest, and easy to trust.",
        "The editorial pages keep the store’s voice focused on usefulness, care, and confident decisions.",
      ],
    },
    {
      id: "what-we-offer",
      kind: "cards",
      title: "What We Offer",
      items: [
        {
          title: "Practical essentials",
          body: "Products selected for daily use, gifting, and repeat purchases.",
        },
        {
          title: "Clear value",
          body: "Helpful information stays visible so shoppers can compare faster.",
        },
      ],
    },
    {
      id: "faq",
      kind: "faq",
      title: "Frequently Asked Questions",
      items: [
        {
          question: "What does SALT focus on?",
          answer: "Useful products, better scanning, and a calmer shopping experience.",
        },
      ],
    },
  ],
  actions: [
    { label: "Shop the catalog", to: "/shop", primary: true },
    { label: "Contact support", to: "/contact" },
  ],
};

describe("EditorialPageTemplate", () => {
  it("renders the editorial hero, section copy, and CTA links", () => {
    render(
      <MemoryRouter>
        <EditorialPageTemplate copy={sampleCopy} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /about salt online store/i })).toBeInTheDocument();
    expect(screen.getByText(/organized, honest, and easy to trust/i)).toBeInTheDocument();
    expect(screen.getByText("Founder-led", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop the catalog/i })).toHaveAttribute("href", "/shop");
    expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("heading", { name: /our story/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what we offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /what does salt focus on/i })).toBeInTheDocument();
  });
});
