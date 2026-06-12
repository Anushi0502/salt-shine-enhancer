import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MainHeader from "./MainHeader";

const { navigateMock, openCartDrawerMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  openCartDrawerMock: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({
      pathname: "/",
      search: "",
    }),
  };
});

vi.mock("@/lib/cart", () => ({
  useCart: () => ({
    itemCount: 3,
    openCartDrawer: openCartDrawerMock,
  }),
}));

vi.mock("@/lib/wishlist", () => ({
  useWishlist: () => ({
    itemCount: 0,
  }),
}));

vi.mock("@/lib/browser-storage", () => ({
  getBrowserStorage: () => null,
}));

vi.mock("@/lib/catalog", () => ({
  filterProducts: () => [],
}));

vi.mock("@/lib/mobile", () => ({
  isNativeApp: () => false,
}));

vi.mock("@/lib/shopify-data", () => ({
  useProducts: () => ({
    data: { products: [] },
  }),
  useCollections: () => ({
    data: { collections: [] },
  }),
}));

describe("MainHeader", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openCartDrawerMock.mockReset();
  });

  it("renders the requested storefront controls", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    expect(screen.getByText("Salt Online Store")).toBeInTheDocument();
    expect(screen.getByText("Deliver to India")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search Salt Online Store")).toBeInTheDocument();
    expect(screen.getByText("Today’s Deals")).toBeInTheDocument();
    expect(screen.getByText("Himalayan Salt")).toBeInTheDocument();
    expect(screen.getByText("Rock Salt")).toBeInTheDocument();
    expect(screen.getByText("Sea Salt")).toBeInTheDocument();
    expect(screen.getByText("Black Salt")).toBeInTheDocument();
    expect(screen.getByText("Bulk Orders")).toBeInTheDocument();
    expect(screen.getByText("Customer Service")).toBeInTheDocument();
    expect(screen.getByText("Hello, sign in / Account & Lists")).toBeInTheDocument();
    expect(screen.getByText("Returns / & Orders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cart with 3 items/i })).toBeInTheDocument();
  });

  it("lets the shopper pick a category and run a search", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /search category all/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sea Salt" }));
    fireEvent.change(screen.getByPlaceholderText("Search Salt Online Store"), {
      target: { value: "coarse grains" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(navigateMock).toHaveBeenCalledWith("/search?q=coarse+grains&category=Sea+Salt");
  });

  it("opens the cart drawer from the header", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /cart with 3 items/i }));

    expect(openCartDrawerMock).toHaveBeenCalledTimes(1);
  });
});
