import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { BadgeCheck, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider } from "../src/lib/cart";
import { WishlistProvider } from "../src/lib/wishlist";
import { ThemeProvider } from "../src/lib/theme";
import MainHeader from "../src/components/layout/MainHeader";
import MainFooter from "../src/components/layout/MainFooter";
import HomeHero from "../src/components/storefront/HomeHero";
import OpenContentPageShell from "../src/components/storefront/OpenContentPageShell";
import ProductCard from "../src/components/storefront/ProductCard";
import SectionHeading from "../src/components/storefront/SectionHeading";
import TrustStrip from "../src/components/storefront/TrustStrip";
import { LoadingState, ErrorState } from "../src/components/storefront/LoadState";
import CartPage from "../src/pages/CartPage";
import heroMain from "../src/assets/hero-main.jpg";
import productLaptopStand from "../src/assets/product-laptop-stand.jpg";
import productPortableStand from "../src/assets/product-portable-stand.jpg";
import productDock from "../src/assets/product-dock.jpg";
import productTripod from "../src/assets/product-tripod.jpg";
import type { ShopifyCollection, ShopifyProduct } from "../src/types/shopify";
import "../src/index.css";

const queryClient = new QueryClient();

function makeMockProduct(
  id: number,
  handle: string,
  title: string,
  imageSrc: string,
  price: number,
  options = 1,
  badgeText = "",
): ShopifyProduct {
  return {
    id,
    handle,
    title,
    body_html: `<p>${title} is a polished preview product used to validate the redesigned storefront shell.</p>`,
    product_type: options > 1 ? "Curated set" : "Featured pick",
    published_at: "2026-07-01T00:00:00Z",
    created_at: "2026-06-20T00:00:00Z",
    variants: Array.from({ length: options }, (_, index) => ({
      id: id * 100 + index + 1,
      title: index === 0 ? "Default Title" : `Option ${index + 1}`,
      price: String(price + index * 8),
      compare_at_price: String(price + index * 8 + 14),
      available: index !== options - 1 || options === 1,
      featured_image: { src: imageSrc },
    })),
    images: [
      {
        src: imageSrc,
        variant_ids: [],
      },
    ],
    image: { src: imageSrc },
    customData: {
      subtitle: badgeText || "Preview set",
      badgeText,
      highlights: ["Premium", "Fluid", "Cohesive"],
      shopChannelMinimumQuantity: options > 1 ? 2 : 1,
    },
    average_rating: 4.8,
    total_reviews: 142,
  } as ShopifyProduct;
}

const featuredProducts = [
  makeMockProduct(1001, "premium-laptop-stand", "Foldable Laptop Stand", productLaptopStand, 48, 1, "Best seller"),
  makeMockProduct(1002, "portable-stand", "Portable Reading Stand", productPortableStand, 36, 1, "New"),
  makeMockProduct(1003, "dock-station", "Charging Dock Station", productDock, 54, 2, "Save 18%"),
  makeMockProduct(1004, "camera-tripod", "Mini Camera Tripod", productTripod, 42, 1, "Curated pick"),
];

const previewCollection: ShopifyCollection = {
  id: 9001,
  handle: "best-sellers",
  title: "Best Sellers",
  body_html: "",
  products_count: featuredProducts.length,
  image: { src: heroMain },
} as ShopifyCollection;

const previewCartSeed = [
  {
    id: 1001001,
    handle: "premium-laptop-stand",
    title: "Foldable Laptop Stand",
    image: productLaptopStand,
    unitPrice: 48,
    quantity: 2,
    shopifyVariantId: 10010010100001,
    productType: "Featured pick",
    minimumQuantity: 1,
  },
  {
    id: 1001002,
    handle: "portable-stand",
    title: "Portable Reading Stand",
    image: productPortableStand,
    unitPrice: 36,
    quantity: 1,
    shopifyVariantId: 10010020100001,
    productType: "Featured pick",
    minimumQuantity: 1,
  },
];

window.localStorage.setItem("salt-cart", JSON.stringify(previewCartSeed));

function PreviewApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CartProvider>
          <WishlistProvider>
            <MemoryRouter initialEntries={["/"]}>
              <div className="site-shell min-h-screen">
                <MainHeader />
                <main className="space-y-10 pb-10 sm:space-y-12">
                  <HomeHero featured={featuredProducts} leadCollection={previewCollection} />

                  <section className="mx-auto w-[min(1240px,calc(100%_-_20px))]">
                    <SectionHeading
                      kicker="Editorial"
                      title="Open content shell"
                      description="Support, policy, and about pages now share a calmer framed layout with a more premium hierarchy."
                      action={
                        <TrustStrip
                          items={[
                            { icon: ShieldCheck, label: "Secure source" },
                            { icon: Truck, label: "Fast shipping" },
                            { icon: BadgeCheck, label: "Shopify synced" },
                          ]}
                        />
                      }
                    />

                    <div className="mt-4">
                      <OpenContentPageShell
                        breadcrumbs={[
                          { label: "Home", to: "/" },
                          { label: "Support", to: "/contact" },
                          { label: "Preview" },
                        ]}
                        kicker="Support"
                        title="A calmer support page with stronger hierarchy"
                        summary="The new shell keeps breadcrumbs, hero copy, actions, and side notes in a premium editorial frame."
                        meta={
                          <div className="flex flex-wrap gap-2">
                            <span className="salt-editorial-meta">Live chat</span>
                            <span className="salt-editorial-meta">Shipping help</span>
                            <span className="salt-editorial-meta">Return policy</span>
                          </div>
                        }
                        aside={
                          <>
                            <div>
                              <p className="salt-kicker">Snapshot</p>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Support content is now framed like a premium magazine spread instead of a utility page.
                              </p>
                            </div>
                            <TrustStrip
                              items={[
                                { icon: ShieldCheck, label: "Policy first" },
                                { icon: Sparkles, label: "Polished UI" },
                              ]}
                            />
                          </>
                        }
                        actions={[
                          { label: "Contact support", primary: true, to: "/contact" },
                          { label: "Browse policies", to: "/policies/privacy-policy" },
                        ]}
                      >
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-[1.4rem] border border-border/70 bg-white/88 p-5">
                            <p className="salt-kicker">Page module</p>
                            <h3 className="mt-2 font-display text-[1.75rem] leading-[0.95] tracking-[-0.04em] text-foreground">
                              Clear actions, more breathing room, and stronger visual focus.
                            </h3>
                            <p className="mt-3 text-sm leading-7 text-muted-foreground">
                              This page block mirrors the new support and policy surfaces used throughout the storefront.
                            </p>
                          </div>
                          <div className="rounded-[1.4rem] border border-border/70 bg-white/88 p-5">
                            <p className="salt-kicker">Trust layer</p>
                            <div className="mt-3 grid gap-2">
                              <span className="salt-editorial-meta w-fit">Shipping updates</span>
                              <span className="salt-editorial-meta w-fit">Returns and exchanges</span>
                              <span className="salt-editorial-meta w-fit">Order lookup</span>
                            </div>
                          </div>
                        </div>
                      </OpenContentPageShell>
                    </div>
                  </section>

                <section className="mx-auto w-[min(1240px,calc(100%_-_20px))]">
                  <SectionHeading
                    kicker="Catalog"
                    title="Premium product card"
                    description="The card system now keeps images, titles, price, and saved state in a lighter, more editorial layout."
                    />

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {featuredProducts.map((product) => (
                        <ProductCard key={product.id} product={product} variant="shop" />
                      ))}
                  </div>
                </section>

                <section className="mx-auto w-[min(1240px,calc(100%_-_20px))]">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LoadingState title="Loading state" subtitle="The shell now feels like a deliberate part of the site." />
                    <ErrorState title="Error state" subtitle="Errors now share the same premium framing and spacing." />
                  </div>
                </section>

                <section className="mx-auto w-[min(1240px,calc(100%_-_20px))]">
                  <SectionHeading
                    kicker="Commerce"
                    title="Cart page"
                    description="The cart now uses the same softer editorial shells, slimmer chrome, and stronger hierarchy."
                  />

                  <div className="mt-4 overflow-hidden rounded-[2rem] border border-border/70 bg-white/82 shadow-[0_28px_72px_-54px_rgba(15,23,42,0.28)]">
                    <CartPage />
                  </div>
                </section>
              </main>
              <MainFooter />
            </div>
          </MemoryRouter>
          </WishlistProvider>
        </CartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Preview root element is missing.");
}

createRoot(root).render(<PreviewApp />);
