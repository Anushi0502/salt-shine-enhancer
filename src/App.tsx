import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import AppErrorBoundary from "@/components/layout/AppErrorBoundary";
import SiteShell from "@/components/layout/SiteShell";
import MetaPixelTracker from "@/components/integrations/MetaPixelTracker";
import NotificationBootstrap from "@/components/integrations/NotificationBootstrap";
import ProductRoutePreloader from "@/components/storefront/ProductRoutePreloader";
import ScrollToTop from "@/components/layout/ScrollToTop";
import { CartProvider } from "@/lib/cart";
import { isNativeApp } from "@/lib/mobile";
import { ThemeProvider } from "@/lib/theme";
import { WishlistProvider } from "@/lib/wishlist";

let homePageModule: Promise<typeof import("@/pages/HomePage")> | null = null;
const loadHomePage = () => (homePageModule ??= import("@/pages/HomePage"));
const isInitialHomeRoute = window.location.pathname === "/";

if (isInitialHomeRoute) {
  void loadHomePage();
}

const HomePage = lazy(loadHomePage);

const AboutPage = lazy(() => import("@/pages/AboutPage"));
const AffiliateProgramPage = lazy(() => import("@/pages/AffiliateProgramPage"));
const BlogPage = lazy(() => import("@/pages/BlogPage"));
const BlogPostPage = lazy(() => import("@/pages/BlogPostPage"));
const BulkReviewPage = lazy(() => import("@/pages/BulkReviewPage"));
const CartPage = lazy(() => import("@/pages/CartPage"));
const CollectionRoutePage = lazy(() => import("@/pages/CollectionRoutePage"));
const CollectionsPage = lazy(() => import("@/pages/CollectionsPage"));
const CollectionSubcollectionRoutePage = lazy(() => import("@/pages/CollectionSubcollectionRoutePage"));
const ContactInformationPolicyPage = lazy(() => import("@/pages/ContactInformationPolicyPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const FaqPage = lazy(() => import("@/pages/FaqPage"));
const FinancePage = lazy(() => import("@/pages/FinancePage"));
const MissionVisionPage = lazy(() => import("@/pages/MissionVisionPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const OrderHistoryPage = lazy(() => import("@/pages/OrderHistoryPage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage"));
// Product detail pages are the highest-intent route. Warm the route module as
// soon as the app entry evaluates on a PDP so React does not wait for the
// router to render before it starts the chunk request.
let productPageModule: Promise<typeof import("@/pages/ProductPage")> | null = null;
const loadProductPage = () => (productPageModule ??= import("@/pages/ProductPage"));
const isInitialProductRoute = /^\/products?\/[^/]+\/?$/.test(window.location.pathname);

if (isInitialProductRoute) {
  void loadProductPage();
}

const ProductPage = lazy(loadProductPage);
const ProductReviewsPage = lazy(() => import("@/pages/ProductReviewsPage"));
const RecentlyViewedPage = lazy(() => import("@/pages/RecentlyViewedPage"));
const RefundPolicyPage = lazy(() => import("@/pages/RefundPolicyPage"));
const ResourcesPage = lazy(() => import("@/pages/ResourcesPage"));
const RouteEditorialPage = lazy(() => import("@/components/storefront/RouteEditorialPage"));
const ShippingPolicyPage = lazy(() => import("@/pages/ShippingPolicyPage"));
const ShopAuthBridgePage = lazy(() => import("@/pages/ShopAuthBridgePage"));
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const TermsConditionsPage = lazy(() => import("@/pages/TermsConditionsPage"));
const TrackOrderPage = lazy(() => import("@/pages/TrackOrderPage"));
const WholesaleInquiriesPage = lazy(() => import("@/pages/WholesaleInquiriesPage"));
const WishlistPage = lazy(() => import("@/pages/WishlistPage"));

const StorefrontShopRoute = () => {
  const [searchParams] = useSearchParams();
  const resourceMode = searchParams.get("resource");
  const resourceHandle = searchParams.get("handle") || "";

  if (resourceMode === "hub") {
    return <ResourcesPage />;
  }

  if (resourceMode === "guide" && resourceHandle) {
    return (
      <RouteEditorialPage
        resolveHandle={() => resourceHandle}
        loadingTitle="Loading resource"
        loadingSubtitle="Building the curated resource page."
        errorTitle="Resource unavailable"
        errorSubtitle="Please retry to refresh the resource page."
      />
    );
  }

  return <ShopPage />;
};

const StorefrontHomeRoute = () => {
  const [searchParams] = useSearchParams();

  // Shopify can redirect into the private finance workspace from the theme.
  // Keep the query-string fallback so older links still reach the workspace.
  return searchParams.get("finance") === "1" ? <FinancePage /> : <HomePage />;
};

const queryClient = new QueryClient();

const AppShell = () => (
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <WishlistProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <MetaPixelTracker />
            <NotificationBootstrap />
            <ProductRoutePreloader />
            <Routes>
              <Route element={<SiteShell />}>
                <Route path="/" element={<StorefrontHomeRoute />} />
                <Route path="/shop" element={<StorefrontShopRoute />} />
                <Route path="/search" element={<ShopPage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="/pages/collections" element={<CollectionsPage />} />
                <Route path="/collections/:handle" element={<CollectionRoutePage />} />
                <Route path="/collections/:handle/:subhandle" element={<CollectionSubcollectionRoutePage />} />
                <Route path="/product/:handle" element={<ProductPage />} />
                <Route path="/products/:handle" element={<ProductPage />} />
                <Route path="/product/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/products/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/wishlist" element={<WishlistPage />} />
                <Route path="/recently-viewed" element={<RecentlyViewedPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/pages/about-us" element={<AboutPage />} />
                <Route path="/mission-vision" element={<MissionVisionPage />} />
                <Route path="/pages/mission-vision" element={<MissionVisionPage />} />
                <Route path="/affiliate-program" element={<AffiliateProgramPage />} />
                <Route path="/pages/affiliate-program" element={<AffiliateProgramPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/pages/resources" element={<ResourcesPage />} />
                <Route path="/pages/finance" element={<FinancePage />} />
                <Route path="/apps:finance" element={<FinancePage />} />
                <Route path="/apps/finance" element={<FinancePage />} />
                <Route
                  path="/resources/:handle"
                  element={
                    <RouteEditorialPage
                      resolveHandle={(params) => params.handle || ""}
                      loadingTitle="Loading resource"
                      loadingSubtitle="Building the curated resource page."
                      errorTitle="Resource unavailable"
                      errorSubtitle="Please retry to refresh the resource page."
                      />
                    }
                  />
                <Route path="/faq" element={<FaqPage />} />
                <Route
                  path="/resources/:category/:handle"
                  element={
                    <RouteEditorialPage
                      resolveHandle={(params) => `${params.category || ""}/${params.handle || ""}`}
                      loadingTitle="Loading resource"
                      loadingSubtitle="Building the curated resource page."
                      errorTitle="Resource unavailable"
                      errorSubtitle="Please retry to refresh the resource page."
                    />
                  }
                />
                <Route
                  path="/pages/resources/:category/:handle"
                  element={
                    <RouteEditorialPage
                      resolveHandle={(params) => `${params.category || ""}/${params.handle || ""}`}
                      loadingTitle="Loading resource"
                      loadingSubtitle="Building the curated resource page."
                      errorTitle="Resource unavailable"
                      errorSubtitle="Please retry to refresh the resource page."
                    />
                  }
                />
                <Route path="/pages/faq" element={<FaqPage />} />
                <Route path="/wholesale-inquiries" element={<WholesaleInquiriesPage />} />
                <Route path="/pages/wholesale-inquiries" element={<WholesaleInquiriesPage />} />
                <Route path="/terms-conditions" element={<TermsConditionsPage />} />
                <Route path="/pages/terms-conditions" element={<TermsConditionsPage />} />
                <Route path="/track-order" element={<TrackOrderPage />} />
                <Route path="/pages/track-order" element={<TrackOrderPage />} />
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
                <Route
                  path="/pages/contact-information"
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
        </CartProvider>
      </WishlistProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

const App = () => (
  <ThemeProvider>
    <AppShell />
  </ThemeProvider>
);

export default App;
