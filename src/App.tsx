import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppErrorBoundary from "@/components/layout/AppErrorBoundary";
import SiteShell from "@/components/layout/SiteShell";
import MetaPixelTracker from "@/components/integrations/MetaPixelTracker";
import NotificationBootstrap from "@/components/integrations/NotificationBootstrap";
import ScrollToTop from "@/components/layout/ScrollToTop";
import { CartProvider } from "@/lib/cart";
import { isNativeApp } from "@/lib/mobile";
import { ThemeProvider } from "@/lib/theme";
import { WishlistProvider } from "@/lib/wishlist";
import AboutPage from "@/pages/AboutPage";
import AffiliateProgramPage from "@/pages/AffiliateProgramPage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import BulkReviewPage from "@/pages/BulkReviewPage";
import CartPage from "@/pages/CartPage";
import CollectionRoutePage from "@/pages/CollectionRoutePage";
import CollectionsPage from "@/pages/CollectionsPage";
import ContactInformationPolicyPage from "@/pages/ContactInformationPolicyPage";
import ContactPage from "@/pages/ContactPage";
import HomePage from "@/pages/HomePage";
import FaqPage from "@/pages/FaqPage";
import MissionVisionPage from "@/pages/MissionVisionPage";
import NotFound from "@/pages/NotFound";
import OrderHistoryPage from "@/pages/OrderHistoryPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import ProductPage from "@/pages/ProductPage";
import ProductReviewsPage from "@/pages/ProductReviewsPage";
import RecentlyViewedPage from "@/pages/RecentlyViewedPage";
import RefundPolicyPage from "@/pages/RefundPolicyPage";
import ResourcesPage from "@/pages/ResourcesPage";
import ShippingPolicyPage from "@/pages/ShippingPolicyPage";
import ShopAuthBridgePage from "@/pages/ShopAuthBridgePage";
import ShopPage from "@/pages/ShopPage";
import TermsConditionsPage from "@/pages/TermsConditionsPage";
import TrackOrderPage from "@/pages/TrackOrderPage";
import CollectionSubcollectionRoutePage from "@/pages/CollectionSubcollectionRoutePage";
import RouteEditorialPage from "@/components/storefront/RouteEditorialPage";
import WholesaleInquiriesPage from "@/pages/WholesaleInquiriesPage";
import WishlistPage from "@/pages/WishlistPage";

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
            <Routes>
              <Route element={<SiteShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/shop" element={<ShopPage />} />
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
