import type { PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import MainHeader from "@/components/layout/MainHeader";
import MainFooter from "@/components/layout/MainFooter";

const SiteShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[650px] bg-[radial-gradient(circle_at_15%_12%,rgba(200,105,46,0.28),transparent_38%),radial-gradient(circle_at_85%_20%,rgba(59,121,104,0.2),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[40%] -z-10 h-[600px] bg-[radial-gradient(circle_at_20%_30%,rgba(186,168,117,0.18),transparent_32%),radial-gradient(circle_at_85%_68%,rgba(200,105,46,0.16),transparent_36%)]" />

      <MainHeader />
      <main>{children || <Outlet />}</main>
      <MainFooter />
    </div>
  );
};

export default SiteShell;
