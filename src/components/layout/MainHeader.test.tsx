import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
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

    expect(screen.getByRole("link", { name: /salt online store/i })).toBeInTheDocument();
    expect(screen.getByAltText("SALT Online Store")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search SALT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Collections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Arrivals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookware" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home Decor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apparel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gifts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Support" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Today's Deals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Himalayan Salt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rock Salt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sea Salt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Black Salt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bulk Orders" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Customer Service" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hello, sign in \/ account & lists/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /returns \/ & orders/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cart with 3 items/i })).toHaveLength(2);
  });

  it("lets the shopper pick a catalog scope and run a search", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /search category all/i }));
    fireEvent.click(screen.getByRole("option", { name: "Cookware" }));
    fireEvent.change(screen.getByPlaceholderText("Search SALT"), {
      target: { value: "coarse grains" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(navigateMock).toHaveBeenCalledWith("/shop?collection=cookware&q=coarse+grains");
  });

  it("opens the compact mobile menu", () => {
    render(
      <MemoryRouter>
        <MainHeader />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

    const menuDialog = screen.getByRole("dialog", { name: /menu/i });

    expect(menuDialog).toBeInTheDocument();
    expect(within(menuDialog).getByRole("link", { name: "All products" })).toBeInTheDocument();
    expect(within(menuDialog).getByRole("link", { name: "Support" })).toBeInTheDocument();
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
