import type { PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import MainHeader from "@/components/layout/MainHeader";
import MainFooter from "@/components/layout/MainFooter";
import ChatBootstrap from "@/components/integrations/ChatBootstrap";

const SiteShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_12%_8%,rgba(200,105,46,0.33),transparent_36%),radial-gradient(circle_at_88%_16%,rgba(59,121,104,0.24),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[42%] -z-10 h-[620px] bg-[radial-gradient(circle_at_20%_30%,rgba(186,168,117,0.22),transparent_32%),radial-gradient(circle_at_85%_68%,rgba(200,105,46,0.18),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_55%_90%,rgba(39,88,75,0.18),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[18%] -z-10 h-[420px] bg-[radial-gradient(circle_at_50%_40%,rgba(230,210,164,0.2),transparent_52%)]" />

      <MainHeader />
      <ChatBootstrap />
      <main id="main-content" className="relative">{children || <Outlet />}</main>
      <MainFooter />
    </div>
  );
};

export default SiteShell;
