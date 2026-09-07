import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import CollectionGridState from "@/components/storefront/CollectionGridState";

function renderInRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>,
  );
}

describe("CollectionGridState", () => {
  it("renders card-shaped placeholders as one accessible loading announcement", () => {
    renderInRouter(<CollectionGridState state="loading" itemCount={6} />);

    const status = screen.getByRole("status", { name: /loading products and current prices/i });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("collection-product-skeleton")).toHaveLength(6);
  });

  it("offers one guarded retry action when the listing request fails", () => {
    const onRetry = vi.fn();
    renderInRouter(<CollectionGridState state="error" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveAccessibleName(/we couldn't load this collection/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /browse collections/i })).toHaveAttribute("href", "/collections");
  });

  it("announces an empty search and exposes recovery routes", () => {
    const onReset = vi.fn();
    renderInRouter(
      <CollectionGridState state="empty" hasSearchQuery query="travel mug" onReset={onReset}>
        <button type="button">Try drinkware</button>
      </CollectionGridState>,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName(/no products found for “travel mug”/i);
    fireEvent.click(screen.getByRole("button", { name: /clear search and filters/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /try drinkware/i })).toBeInTheDocument();
  });

  it("disables retry while the same request is already in flight", () => {
    const onRetry = vi.fn();
    renderInRouter(<CollectionGridState state="error" onRetry={onRetry} retrying />);

    const retryButton = screen.getByRole("button", { name: /retrying/i });
    expect(retryButton).toBeDisabled();
    fireEvent.click(retryButton);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
