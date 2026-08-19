import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { CollectionHoverMenu } from "@/components/layout/CollectionHoverMenu";
import type { CollectionNavigationGroup } from "@/lib/shopify-navigation";

function makeCollection(
  title: string,
  handle: string,
  subcollections: Array<{ title: string; handle: string }> = [],
): CollectionNavigationGroup {
  return {
    id: `group-${handle}`,
    title,
    handle,
    href: `/collections/${handle}`,
    items: subcollections.map((subcollection) => ({
      id: `${handle}-${subcollection.handle}`,
      title: subcollection.title,
      handle: subcollection.handle,
      href: `/collections/${subcollection.handle}`,
    })),
  };
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname + location.search}</div>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CollectionHoverMenu", () => {
  it("switches the submenu when a different collection is hovered", () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CollectionHoverMenu
          collections={[
            makeCollection("Senior Living Solutions", "senior-living-solutions", [
              { title: "Daily Living Aids", handle: "daily-living-aids" },
            ]),
            makeCollection("Travel & Outdoor", "travel-outdoor", [{ title: "Camping Gear", handle: "camping-gear" }]),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Daily Living Aids" })).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Travel & Outdoor" }));

    expect(screen.getByRole("link", { name: "Camping Gear" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Daily Living Aids" })).not.toBeInTheDocument();
  });

  it("keeps the submenu open while the pointer is over the submenu and closes after the delay", async () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CollectionHoverMenu
          collections={[
            makeCollection("Senior Living Solutions", "senior-living-solutions", [
              { title: "Daily Living Aids", handle: "daily-living-aids" },
            ]),
            makeCollection("Travel & Outdoor", "travel-outdoor", [{ title: "Camping Gear", handle: "camping-gear" }]),
          ]}
        />
      </MemoryRouter>,
    );

    const submenu = screen.getByTestId("collection-hover-submenu");
    fireEvent.mouseLeave(screen.getByRole("button", { name: "Senior Living Solutions" }));
    fireEvent.mouseEnter(submenu);

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.getByRole("link", { name: "Daily Living Aids" })).toBeInTheDocument();

    fireEvent.mouseLeave(submenu);
    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(submenu).toHaveAttribute("aria-hidden", "true");
    expect(submenu).toHaveAttribute("data-state", "closed");
  });

  it("navigates subcollection clicks to their canonical collection route", () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <LocationProbe />
                <CollectionHoverMenu
                  collections={[
                    makeCollection("Senior Living Solutions", "senior-living-solutions", [
                      { title: "Daily Living Aids", handle: "daily-living-aids" },
                    ]),
                    makeCollection("Travel & Outdoor", "travel-outdoor", [
                      { title: "Camping Gear", handle: "camping-gear" },
                    ]),
                  ]}
                />
              </>
            }
          />
          <Route path="/collections/:handle" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Daily Living Aids" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/collections/daily-living-aids",
    );
  });
});
