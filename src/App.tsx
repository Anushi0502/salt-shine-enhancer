import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import AppErrorBoundary from "@/components/layout/AppErrorBoundary";
import SiteShell from "@/components/layout/SiteShell";
import DeferredAppIntegrations from "@/components/integrations/DeferredAppIntegrations";
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
const isInitialProductRoute = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products?\/[^/]+\/?$/i.test(
  window.location.pathname,
);

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
          <BrowserRouter future={{ v7_startTransition: true }}>
            <ScrollToTop />
            <DeferredAppIntegrations />
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
                <Route path="/:locale/collections/:handle" element={<CollectionRoutePage />} />
                <Route path="/:locale/collections/:handle/:subhandle" element={<CollectionSubcollectionRoutePage />} />
                <Route path="/product/:handle" element={<ProductPage />} />
                <Route path="/products/:handle" element={<ProductPage />} />
                <Route path="/:locale/product/:handle" element={<ProductPage />} />
                <Route path="/:locale/products/:handle" element={<ProductPage />} />
                <Route path="/product/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/products/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/:locale/product/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/:locale/products/:handle/reviews" element={<ProductReviewsPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/wishlist" element={<WishlistPage />} />
                <Route path="/pages/wishlist" element={<WishlistPage />} />
                <Route path="/recently-viewed" element={<RecentlyViewedPage />} />
                <Route path="/pages/recently-viewed" element={<RecentlyViewedPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/pages/about-us" element={<AboutPage />} />
                <Route path="/mission-vision" element={<MissionVisionPage />} />
                <Route path="/pages/mission-vision" element={<MissionVisionPage />} />
                <Route path="/affiliate-program" element={<AffiliateProgramPage />} />
                <Route path="/pages/affiliate-program" element={<AffiliateProgramPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/pages/resources" element={<ResourcesPage />} />
                <Route
                  path="/pages/interactive-stem-assembly-activities-for-kids"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "interactive-stem-assembly-activities-for-kids"}
                      loadingTitle="Loading activity guide"
                      loadingSubtitle="Building the curated STEM activity page."
                      errorTitle="Activity guide unavailable"
                      errorSubtitle="Please retry to refresh the activity guide."
                    />
                  }
                />
                <Route
                  path="/pages/digital-circus-lunch-box-for-kids"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "digital-circus-lunch-box-for-kids"}
                      loadingTitle="Loading lunch-box guide"
                      loadingSubtitle="Building the current lunch-box discovery page."
                      errorTitle="Lunch-box guide unavailable"
                      errorSubtitle="Please retry to refresh the lunch-box guide."
                    />
                  }
                />
                <Route
                  path="/pages/kitchen-cookware-buying-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "kitchen-cookware-buying-guide"}
                      loadingTitle="Loading kitchen guide"
                      loadingSubtitle="Building the current kitchen and cookware guide."
                      errorTitle="Kitchen guide unavailable"
                      errorSubtitle="Please retry to refresh the kitchen guide."
                    />
                  }
                />
                <Route
                  path="/pages/jeans-denim-fit-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "jeans-denim-fit-guide"}
                      loadingTitle="Loading denim guide"
                      loadingSubtitle="Building the current jeans and denim guide."
                      errorTitle="Denim guide unavailable"
                      errorSubtitle="Please retry to refresh the denim guide."
                    />
                  }
                />
                <Route
                  path="/pages/mobwol-watch-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "mobwol-watch-guide"}
                      loadingTitle="Loading watch guide"
                      loadingSubtitle="Building the current watch comparison guide."
                      errorTitle="Watch guide unavailable"
                      errorSubtitle="Please retry to refresh the watch guide."
                    />
                  }
                />
                <Route
                  path="/pages/realme-buds-case-compatibility-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "realme-buds-case-compatibility-guide"}
                      loadingTitle="Loading case guide"
                      loadingSubtitle="Building the current Realme Buds compatibility guide."
                      errorTitle="Case guide unavailable"
                      errorSubtitle="Please retry to refresh the case compatibility guide."
                    />
                  }
                />
                <Route
                  path="/pages/salt-earbuds-buying-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "salt-earbuds-buying-guide"}
                      loadingTitle="Loading earbuds guide"
                      loadingSubtitle="Building the current earbuds buying guide."
                      errorTitle="Earbuds guide unavailable"
                      errorSubtitle="Please retry to refresh the earbuds guide."
                    />
                  }
                />
                <Route
                  path="/pages/canvas-belt-sizing-style-guide"
                  element={
                    <RouteEditorialPage
                      resolveHandle={() => "canvas-belt-sizing-style-guide"}
                      loadingTitle="Loading belt guide"
                      loadingSubtitle="Building the current canvas belt sizing guide."
                      errorTitle="Belt guide unavailable"
                      errorSubtitle="Please retry to refresh the belt guide."
                    />
                  }
                />
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
                <Route path="/pages/blog" element={<BlogPage />} />
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
                <Route path="/pages/contact-us" element={<ContactPage />} />
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
