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

    expect(screen.getByRole("link", { name: "Salt Online Store" })).toBeInTheDocument();
    expect(screen.getByAltText("SALT Online Store")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search Salt Online Store")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today's Deals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Himalayan Salt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rock Salt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sea Salt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Black Salt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bulk Orders" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customer Service" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hello, sign in \/ account & lists/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /returns \/ & orders/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cart with 3 items/i })).toHaveLength(2);
  });

  it("lets the shopper pick a category and run a search", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /search category all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Sea Salt" }));
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

    fireEvent.click(screen.getAllByRole("button", { name: /cart with 3 items/i })[0]);

    expect(openCartDrawerMock).toHaveBeenCalledTimes(1);
  });
});
