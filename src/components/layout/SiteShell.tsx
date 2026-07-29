import { lazy, Suspense, useEffect, useMemo, type PropsWithChildren } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import MainFooter from "@/components/layout/MainFooter";
import MainHeader from "@/components/layout/MainHeader";
import NativeAppBottomBar from "@/components/layout/NativeAppBottomBar";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import { LoadingState } from "@/components/storefront/LoadState";
import { isNativeApp } from "@/lib/mobile";
import { useCart } from "@/lib/cart";
import { useShop } from "@/lib/shop-data";
import { buildOrganizationStructuredData, buildWebsiteStructuredData } from "@/lib/structured-data";

const CartDrawer = lazy(() => import("@/components/storefront/CartDrawer"));
const PUMPER_BRIDGE_ROUTE = /^\/(?:products?|cart)(?:\/|$)/;
const FINANCE_PATHS = new Set(["/apps:finance", "/apps/finance", "/pages/finance"]);

const DeferredCartDrawer = () => {
  const { isDrawerOpen } = useCart();

  if (!isDrawerOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CartDrawer />
    </Suspense>
  );
};

const RouteLoadingState = ({ isHomePage }: { isHomePage: boolean }) => (
  <div className="mx-auto w-full max-w-[1360px] px-4 py-4 sm:px-6 lg:px-10">
    <LoadingState
      title={isHomePage ? "Loading storefront" : "Loading page"}
      subtitle="Preparing products, categories, and account tools."
    />
  </div>
);

const SiteShell = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const isFinancePage =
    FINANCE_PATHS.has(location.pathname) ||
    (location.pathname === "/" && new URLSearchParams(location.search).get("finance") === "1");
  const nativeApp = isNativeApp();
  const hideFooter = nativeApp;
  const { data: shopPayload } = useShop(!isFinancePage);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    if (!PUMPER_BRIDGE_ROUTE.test(location.pathname)) {
      return;
    }

    // The bridge only interacts with product/cart widgets. Loading it after a
    // matching route keeps its DOM-observer code out of the home-page bundle.
    void import("@/lib/pumper-bridge").then(({ installSaltPumperBridge }) => {
      installSaltPumperBridge();
    });
  }, [location.pathname]);

  const globalStructuredData = useMemo(() => {
    if (!origin) {
      return [];
    }

    return [
      buildOrganizationStructuredData(shopPayload?.shop, origin),
      buildWebsiteStructuredData(shopPayload?.shop, origin),
    ].filter(Boolean);
  }, [origin, shopPayload?.shop]);

  return (
    <div
      data-page-context={isHomePage ? "home" : "inner"}
      className={`site-shell relative min-h-screen overflow-x-clip text-foreground ${
        nativeApp ? "native-ajio-shell bg-background" : "bg-transparent"
      } ${isHomePage ? "is-homepage" : "is-inner-page"}`}
    >
      {isFinancePage ? null : <SeoMetadata scope="global" structuredData={globalStructuredData} />}
      {nativeApp ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_48%),radial-gradient(circle_at_12%_18%,rgba(214,31,38,0.08),transparent_24%),radial-gradient(circle_at_88%_20%,rgba(17,17,17,0.12),transparent_26%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(17,17,17,0.04))]" />
        </>
      ) : null}

      {isFinancePage ? null : <MainHeader />}
      {isFinancePage ? null : <ChatBootstrap />}
      {isFinancePage ? null : <DeferredCartDrawer />}
      <main
        id="main-content"
        className={`relative ${hideFooter ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        <Suspense fallback={<RouteLoadingState isHomePage={isHomePage} />}>
          {children ?? <Outlet />}
        </Suspense>
      </main>
      {isFinancePage ? null : <NativeAppBottomBar />}
      {isFinancePage || hideFooter ? null : <MainFooter />}
    </div>
  );
};

export default SiteShell;
