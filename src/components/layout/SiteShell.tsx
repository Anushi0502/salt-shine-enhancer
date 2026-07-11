import { Suspense, useMemo, type PropsWithChildren } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sparkles, ShieldCheck, Truck } from "lucide-react";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import MainFooter from "@/components/layout/MainFooter";
import MainHeader from "@/components/layout/MainHeader";
import NativeAppBottomBar from "@/components/layout/NativeAppBottomBar";
import CartDrawer from "@/components/storefront/CartDrawer";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import TrustStrip from "@/components/storefront/TrustStrip";
import { LoadingState } from "@/components/storefront/LoadState";
import { isNativeApp } from "@/lib/mobile";
import { useShop } from "@/lib/shopify-data";
import { buildOrganizationStructuredData, buildWebsiteStructuredData } from "@/lib/sales-optimization";

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
  const nativeApp = isNativeApp();
  const hideFooter = nativeApp;
  const { data: shopPayload } = useShop();
  const shopCustomData = shopPayload?.shop.customData || null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const bannerText =
    shopCustomData?.bannerText?.trim() ||
    "Curated essentials with stronger discovery, clearer merchandising, and faster checkout.";
  const trustLabels = shopCustomData?.trustStrip?.length
    ? shopCustomData.trustStrip
    : ["US shipping included", "Secure checkout", "Curated by category"];
  const trustItems = [Truck, ShieldCheck, Sparkles].map((icon, index) => ({
    icon,
    label: trustLabels[index] || trustLabels[0] || "",
  })).filter((item) => Boolean(item.label));
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
        nativeApp ? "native-ajio-shell bg-[#f6f2eb]" : "bg-transparent"
      } ${isHomePage ? "is-homepage" : "is-inner-page"}`}
    >
      <SeoMetadata scope="global" structuredData={globalStructuredData} />
      {nativeApp ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_48%),radial-gradient(circle_at_12%_18%,rgba(214,31,38,0.08),transparent_24%),radial-gradient(circle_at_88%_20%,rgba(17,17,17,0.12),transparent_26%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(17,17,17,0.04))]" />
        </>
      ) : null}

      <div className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(12,32,72,0.98),rgba(31,99,216,0.96),rgba(43,103,219,0.94))] text-white shadow-[0_12px_32px_-28px_rgba(12,32,72,0.64)]">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 px-4 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex items-center gap-2 text-[0.72rem] font-semibold leading-5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/12 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="line-clamp-2">{bannerText}</span>
          </div>
          <TrustStrip
            className="shrink-0"
            items={trustItems.map((item) => ({
              icon: item.icon,
              label: item.label,
            }))}
          />
        </div>
      </div>
      <MainHeader />
      <ChatBootstrap />
      <CartDrawer />
      <main
        id="main-content"
        className={`relative ${hideFooter ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        <Suspense fallback={<RouteLoadingState isHomePage={isHomePage} />}>
          {children ?? <Outlet />}
        </Suspense>
      </main>
      <NativeAppBottomBar />
      {hideFooter ? null : <MainFooter />}
    </div>
  );
};

export default SiteShell;
