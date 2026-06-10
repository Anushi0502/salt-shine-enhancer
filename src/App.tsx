import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, startTransition, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/lib/cart";
import { isNativeApp } from "@/lib/mobile";
import { ThemeProvider } from "@/lib/theme";
import { WishlistProvider } from "@/lib/wishlist";

const SiteShell = lazy(() => import("@/components/layout/SiteShell"));
const queryClient = new QueryClient();
const AppBootSplash = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-[#eef5ff]">
    <div className="w-[min(28rem,86vw)] rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_70px_-36px_rgba(26,77,154,0.5)]">
      <div className="flex items-center gap-4">
        <img
          src="/brand/salt-logo.png"
          alt="SALT"
          className="h-14 w-14 rounded-[1.1rem] object-cover shadow-[0_12px_28px_-18px_rgba(26,77,154,0.55)]"
        />
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-[#1f4b97]">
            Loading storefront
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Preparing the Shopify storefront and order account experience.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const ScrollToTop = lazy(() => import("@/components/layout/ScrollToTop"));
const MetaPixelTracker = lazy(() => import("@/components/integrations/MetaPixelTracker"));
const NotificationBootstrap = lazy(() => import("@/components/integrations/NotificationBootstrap"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const CollectionsPage = lazy(() => import("@/pages/CollectionsPage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const ProductReviewsPage = lazy(() => import("@/pages/ProductReviewsPage"));
const CartPage = lazy(() => import("@/pages/CartPage"));
const WishlistPage = lazy(() => import("@/pages/WishlistPage"));
const RecentlyViewedPage = lazy(() => import("@/pages/RecentlyViewedPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const BlogPage = lazy(() => import("@/pages/BlogPage"));
const BlogPostPage = lazy(() => import("@/pages/BlogPostPage"));
const OrderHistoryPage = lazy(() => import("@/pages/OrderHistoryPage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage"));
const RefundPolicyPage = lazy(() => import("@/pages/RefundPolicyPage"));
const ShippingPolicyPage = lazy(() => import("@/pages/ShippingPolicyPage"));
const ContactInformationPolicyPage = lazy(() => import("@/pages/ContactInformationPolicyPage"));
const ShopAuthBridgePage = lazy(() => import("@/pages/ShopAuthBridgePage"));
const BulkReviewPage = lazy(() => import("@/pages/BulkReviewPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const AppShell = () => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WishlistProvider>
          <CartProvider>
            <Suspense fallback={<AppBootSplash />}>
              <BrowserRouter>
                <ScrollToTop />
                <MetaPixelTracker />
                <NotificationBootstrap />
                <Routes>
                  <Route element={<SiteShell />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/shop" element={<ShopPage />} />
                    <Route path="/search" element={<ShopPage />} />
                    <Route path="/collections" element={<CollectionsPage />} />
                    <Route path="/collections/:handle" element={<ShopPage />} />
                    <Route path="/product/:handle" element={<ProductPage />} />
                    <Route path="/products/:handle" element={<ProductPage />} />
                    <Route path="/product/:handle/reviews" element={<ProductReviewsPage />} />
                    <Route path="/products/:handle/reviews" element={<ProductReviewsPage />} />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/wishlist" element={<WishlistPage />} />
                    <Route path="/recently-viewed" element={<RecentlyViewedPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/pages/about-us" element={<AboutPage />} />
                    <Route path="/blog" element={<BlogPage />} />
                    <Route path="/blog/:handle" element={<BlogPostPage />} />
                    <Route path="/blogs/:blogHandle" element={<BlogPage />} />
                    <Route path="/blogs/:blogHandle/:handle" element={<BlogPostPage />} />
                    <Route path="/order-history" element={<Navigate to="/account/orders" replace />} />
                    <Route
                      path="/bulk-review"
                      element={isNativeApp() ? <Navigate to="/shop" replace /> : <BulkReviewPage />}
                    />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/pages/contact" element={<ContactPage />} />
                    <Route path="/customer-access" element={<Navigate to="/" replace />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/signup" element={<Navigate to="/" replace />} />
                    <Route path="/register" element={<Navigate to="/" replace />} />
                    <Route
                      path="/policies/contact-information"
                      element={<ContactInformationPolicyPage />}
                    />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/refund-policy" element={<RefundPolicyPage />} />
                    <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
                    <Route path="/policies/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/policies/refund-policy" element={<RefundPolicyPage />} />
                    <Route path="/policies/shipping-policy" element={<ShippingPolicyPage />} />
                    <Route path="/account" element={<Navigate to="/account/orders" replace />} />
                    <Route path="/account/orders" element={<OrderHistoryPage />} />
                    <Route path="/account/authorize" element={<ShopAuthBridgePage />} />
                    <Route path="/account/*" element={<ShopAuthBridgePage />} />
                    <Route path="/customer_authentication/*" element={<ShopAuthBridgePage />} />
                    <Route path="/services/login_with_shop/*" element={<ShopAuthBridgePage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </Suspense>
          </CartProvider>
        </WishlistProvider>
      </ThemeProvider>
    </QueryClientProvider>
);

const App = () => {
  const [isShellReady, setIsShellReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      startTransition(() => {
        setIsShellReady(true);
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!isShellReady) {
    return <AppBootSplash />;
  }

  return <AppShell />;
};

export default App;
