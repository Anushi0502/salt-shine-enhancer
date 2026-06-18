import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLocation, useParams, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HomeCategoryHierarchy } from "@/components/storefront/HomeCategoryHierarchy";
import type { ShopifyCollection } from "@/types/shopify";

function makeCollection(handle: string, title: string, description = ""): ShopifyCollection {
  return {
    id: handle.length * 100 + title.length,
    title,
    handle,
    description,
    published_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    image: null,
    products_count: 1,
  };
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-search">{location.search}</div>;
}

function CollectionRouteProbe() {
  const params = useParams();

  return <div data-testid="collection-route">{params.handle}</div>;
}

function HomeRoute({ collections }: { collections: ShopifyCollection[] }) {
  return (
    <>
      <LocationProbe />
      <HomeCategoryHierarchy collections={collections} />
    </>
  );
}

describe("HomeCategoryHierarchy", () => {
  it("updates the subcategory rail when a category is selected", async () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/"
            element={
              <HomeRoute
                collections={[
                  makeCollection("cookware", "Kitchen Essentials", "<p>Practical kitchen tools and cookware for daily use.</p>"),
                  makeCollection("cooking-essential", "COOKING ESSENTIAL"),
                  makeCollection("home-decor", "Home & Living", "<p>Curated home essentials for everyday living.</p>"),
                  makeCollection("candles", "CANDLES"),
                  makeCollection("new-arrivals", "New Arrivals"),
                  makeCollection("appplaza-best-sellers", "Best Sellers"),
                  makeCollection("winter-wear", "Clearance"),
                ]}
              />
            }
          />
          <Route path="/collections/:handle" element={<CollectionRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("location-search")).toHaveTextContent("category=cookware"));
    expect(screen.getByRole("link", { name: /View all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Home & Decor/i }));

    expect(screen.getByTestId("location-search")).toHaveTextContent("category=home-decor");
  });

  it("navigates subcategory clicks to the collection route", async () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/"
            element={
              <HomeRoute
                collections={[
                  makeCollection("cookware", "Kitchen Essentials"),
                  makeCollection("cooking-essential", "COOKING ESSENTIAL"),
                  makeCollection("home-decor", "Home & Living"),
                  makeCollection("candles", "CANDLES"),
                  makeCollection("new-arrivals", "New Arrivals"),
                  makeCollection("appplaza-best-sellers", "Best Sellers"),
                  makeCollection("winter-wear", "Clearance"),
                ]}
              />
            }
          />
          <Route path="/collections/:handle" element={<CollectionRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Home & Decor/i }));
    fireEvent.click(screen.getByRole("link", { name: /View all/i }));

    expect(screen.getByTestId("collection-route")).toHaveTextContent("home-decor");
  });
});
