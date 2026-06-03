import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import SiteShell from "@/components/layout/SiteShell";
import NotificationBootstrap from "@/components/integrations/NotificationBootstrap";
import { CartProvider } from "@/lib/cart";
import { isNativeApp } from "@/lib/mobile";
import { ThemeProvider } from "@/lib/theme";
import { WishlistProvider } from "@/lib/wishlist";
import HomePage from "@/pages/HomePage";
import ShopPage from "@/pages/ShopPage";
import CollectionsPage from "@/pages/CollectionsPage";
import ProductPage from "@/pages/ProductPage";
import ProductReviewsPage from "@/pages/ProductReviewsPage";
import CartPage from "@/pages/CartPage";
import WishlistPage from "@/pages/WishlistPage";
import RecentlyViewedPage from "@/pages/RecentlyViewedPage";
import AboutPage from "@/pages/AboutPage";
import ContactPage from "@/pages/ContactPage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import OrderHistoryPage from "@/pages/OrderHistoryPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import RefundPolicyPage from "@/pages/RefundPolicyPage";
import ShippingPolicyPage from "@/pages/ShippingPolicyPage";
import ContactInformationPolicyPage from "@/pages/ContactInformationPolicyPage";
import ShopAuthBridgePage from "@/pages/ShopAuthBridgePage";
import BulkReviewPage from "@/pages/BulkReviewPage";
import ScrollToTop from "@/components/layout/ScrollToTop";
import MetaPixelTracker from "@/components/integrations/MetaPixelTracker";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const shouldLoadVercelTelemetry = (() => {
  const flag = String(import.meta.env.VITE_ENABLE_VERCEL_ANALYTICS || "").trim().toLowerCase();
  if (flag === "true") {
    return true;
  }

  return false;
})();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WishlistProvider>
          <CartProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
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
                    <Route path="/order-history" element={<OrderHistoryPage />} />
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
                    <Route path="/account/orders" element={<OrderHistoryPage />} />
                    <Route path="/account/*" element={<ShopAuthBridgePage />} />
                    <Route path="/customer_authentication/*" element={<ShopAuthBridgePage />} />
                    <Route path="/services/login_with_shop/*" element={<ShopAuthBridgePage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </BrowserRouter>
              {shouldLoadVercelTelemetry ? <SpeedInsights /> : null}
              {shouldLoadVercelTelemetry ? <Analytics /> : null}
            </TooltipProvider>
          </CartProvider>
        </WishlistProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
