import { Suspense, type PropsWithChildren } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import MainFooter from "@/components/layout/MainFooter";
import MainHeader from "@/components/layout/MainHeader";
import NativeAppBottomBar from "@/components/layout/NativeAppBottomBar";
import CartDrawer from "@/components/storefront/CartDrawer";
import { LoadingState } from "@/components/storefront/LoadState";
import { isNativeApp } from "@/lib/mobile";

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

  return (
    <div
      data-page-context={isHomePage ? "home" : "inner"}
      className={`site-shell relative min-h-screen overflow-x-clip text-foreground ${
        nativeApp ? "native-ajio-shell bg-[#f6f2eb]" : "bg-transparent"
      } ${isHomePage ? "is-homepage" : "is-inner-page"}`}
    >
      {nativeApp ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_48%),radial-gradient(circle_at_12%_18%,rgba(214,31,38,0.08),transparent_24%),radial-gradient(circle_at_88%_20%,rgba(17,17,17,0.12),transparent_26%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(17,17,17,0.04))]" />
        </>
      ) : null}

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
