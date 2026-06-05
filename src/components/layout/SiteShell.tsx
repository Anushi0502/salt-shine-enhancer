import type { PropsWithChildren } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import MainFooter from "@/components/layout/MainFooter";
import MainHeader from "@/components/layout/MainHeader";
import NativeAppBottomBar from "@/components/layout/NativeAppBottomBar";
import CartDrawer from "@/components/storefront/CartDrawer";
import { isNativeApp } from "@/lib/mobile";

const SiteShell = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const nativeApp = isNativeApp();
  const hideFooter = nativeApp;

  return (
    <div
      data-page-context={isHomePage ? "home" : "inner"}
      className={`site-shell relative min-h-screen overflow-x-clip ${
        nativeApp ? "native-ajio-shell bg-[#f6f2eb]" : "bg-[#eef5ff]"
      } ${isHomePage ? "is-homepage" : "is-inner-page"}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 -z-10 ${
          nativeApp
            ? "h-[32rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_48%),radial-gradient(circle_at_12%_18%,rgba(214,31,38,0.08),transparent_24%),radial-gradient(circle_at_88%_20%,rgba(17,17,17,0.12),transparent_26%)]"
            : "h-[36rem] bg-[radial-gradient(circle_at_top,rgba(255,242,191,0.42),transparent_52%),radial-gradient(circle_at_90%_20%,rgba(93,138,237,0.24),transparent_30%)]"
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 ${
          nativeApp
            ? "h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(17,17,17,0.04))]"
            : "h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(199,222,255,0.52))]"
        }`}
      />

      <MainHeader />
      <ChatBootstrap />
      <CartDrawer />
      <main
        id="main-content"
        className={`relative ${hideFooter ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        {children || <Outlet />}
      </main>
      <NativeAppBottomBar />
      {hideFooter ? null : <MainFooter />}
    </div>
  );
};

export default SiteShell;
