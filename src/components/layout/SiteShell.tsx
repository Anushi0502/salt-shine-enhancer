import type { PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import MainHeader from "@/components/layout/MainHeader";
import MainFooter from "@/components/layout/MainFooter";

const SiteShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_12%_8%,rgba(200,105,46,0.3),transparent_36%),radial-gradient(circle_at_88%_16%,rgba(59,121,104,0.22),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[42%] -z-10 h-[620px] bg-[radial-gradient(circle_at_20%_30%,rgba(186,168,117,0.2),transparent_32%),radial-gradient(circle_at_85%_68%,rgba(200,105,46,0.16),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_55%_90%,rgba(39,88,75,0.16),transparent_42%)]" />

      <MainHeader />
      <main>{children || <Outlet />}</main>
      <MainFooter />
    </div>
  );
};

export default SiteShell;
