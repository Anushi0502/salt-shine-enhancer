import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import SiteShell from "@/components/layout/SiteShell";
import { CartProvider } from "@/lib/cart";
import { ThemeProvider } from "@/lib/theme";
import HomePage from "@/pages/HomePage";
import ShopPage from "@/pages/ShopPage";
import CollectionsPage from "@/pages/CollectionsPage";
import ProductPage from "@/pages/ProductPage";
import CartPage from "@/pages/CartPage";
import AboutPage from "@/pages/AboutPage";
import ContactPage from "@/pages/ContactPage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import RefundPolicyPage from "@/pages/RefundPolicyPage";
import ShippingPolicyPage from "@/pages/ShippingPolicyPage";
import ContactInformationPolicyPage from "@/pages/ContactInformationPolicyPage";
import ScrollToTop from "@/components/layout/ScrollToTop";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const shouldLoadVercelTelemetry = (() => {
  const flag = String(import.meta.env.VITE_ENABLE_VERCEL_ANALYTICS || "").trim().toLowerCase();
  if (flag === "true") {
    return true;
  }

  return false;
})();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <CartProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<SiteShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/search" element={<ShopPage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="/collections/:handle" element={<ShopPage />} />
                <Route path="/product/:handle" element={<ProductPage />} />
                <Route path="/products/:handle" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/pages/about-us" element={<AboutPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:handle" element={<BlogPostPage />} />
                <Route path="/blogs/:blogHandle" element={<BlogPage />} />
                <Route path="/blogs/:blogHandle/:handle" element={<BlogPostPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/pages/contact" element={<ContactPage />} />
                <Route path="/policies/contact-information" element={<ContactInformationPolicyPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/refund-policy" element={<RefundPolicyPage />} />
                <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
                <Route path="/policies/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/policies/refund-policy" element={<RefundPolicyPage />} />
                <Route path="/policies/shipping-policy" element={<ShippingPolicyPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
          {shouldLoadVercelTelemetry ? <SpeedInsights /> : null}
          {shouldLoadVercelTelemetry ? <Analytics /> : null}
        </TooltipProvider>
      </CartProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
