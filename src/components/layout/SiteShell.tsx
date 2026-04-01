import type { PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";
import FloatingActions from "@/components/layout/FloatingActions";
import MainFooter from "@/components/layout/MainFooter";
import MainHeader from "@/components/layout/MainHeader";
import CartDrawer from "@/components/storefront/CartDrawer";

const SiteShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(circle_at_top,rgba(244,231,214,0.82),transparent_44%),radial-gradient(circle_at_86%_14%,rgba(188,202,187,0.34),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[22rem] -z-10 h-[48rem] bg-[radial-gradient(circle_at_14%_22%,rgba(216,196,175,0.22),transparent_34%),radial-gradient(circle_at_78%_58%,rgba(194,206,189,0.22),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[32rem] bg-[linear-gradient(180deg,transparent,rgba(247,242,236,0.84))]" />

      <MainHeader />
      <ChatBootstrap />
      <CartDrawer />
      <main id="main-content" className="relative">
        {children || <Outlet />}
      </main>
      <MainFooter />
      <FloatingActions />
    </div>
  );
};

export default SiteShell;
