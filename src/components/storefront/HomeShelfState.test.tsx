import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { HomeShelfState } from "@/components/storefront/HomeShelfState";

function renderState(props: React.ComponentProps<typeof HomeShelfState>) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HomeShelfState {...props} />
    </MemoryRouter>,
  );
}

describe("HomeShelfState", () => {
  it("announces loading and renders a stable six-card shelf skeleton", () => {
    renderState({ shelfTitle: "Best Sellers", state: "loading" });

    expect(screen.getByRole("status", { name: "Loading Best Sellers products" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelectorAll('[data-home-shelf-skeleton="true"]')).toHaveLength(6);
  });

  it("keeps an empty shelf discoverable with an accessible shopping action", () => {
    renderState({ shelfTitle: "Watches", state: "empty" });

    expect(screen.getByRole("status")).toHaveTextContent("More Watches picks are coming soon");
    expect(screen.getByRole("link", { name: "Shop all products" })).toHaveAttribute("href", "/collections/all");
  });

  it("announces failures and retries through the provided cached query action", () => {
    const onRetry = vi.fn();
    renderState({ shelfTitle: "Lip Care", state: "error", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load Lip Care");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate retry clicks while a shelf query is already refetching", () => {
    const onRetry = vi.fn();
    renderState({ shelfTitle: "Anime Collectables", state: "error", onRetry, isRetrying: true });

    const retryButton = screen.getByRole("button", { name: "Trying again" });
    expect(retryButton).toBeDisabled();
    fireEvent.click(retryButton);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
