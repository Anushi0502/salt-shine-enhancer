import { Link, useLocation } from "react-router-dom";
import { Grid2x2, Headphones, House, ShoppingBag } from "lucide-react";
import { isNativeApp } from "@/lib/mobile";

type NavItem = {
  label: string;
  to: string;
  icon: typeof House;
  isActive?: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    label: "Home",
    to: "/",
    icon: House,
    isActive: (pathname) => pathname === "/",
  },
  {
    label: "Shop",
    to: "/shop?collection=all-products",
    icon: ShoppingBag,
    isActive: (pathname) =>
      pathname === "/shop" ||
      pathname === "/search" ||
      pathname.startsWith("/shop/") ||
      pathname.startsWith("/search/") ||
      pathname.startsWith("/product/") ||
      pathname.startsWith("/products/"),
  },
  {
    label: "Collections",
    to: "/collections",
    icon: Grid2x2,
    isActive: (pathname) => pathname === "/collections" || pathname.startsWith("/collections/"),
  },
  {
    label: "Support",
    to: "/contact",
    icon: Headphones,
    isActive: (pathname) => pathname === "/contact" || pathname.startsWith("/pages/contact"),
  },
];

function isActiveNavItem(item: NavItem, pathname: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname);
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const NativeAppBottomBar = () => {
  const location = useLocation();

  if (!isNativeApp()) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3"
      data-native-app-bottom-bar
    >
      <nav className="pointer-events-auto mx-auto flex w-full max-w-[32rem] items-stretch gap-1 rounded-[1.55rem] border border-[#ddd4c7] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,246,240,0.97)_100%)] px-1.5 py-1.5 shadow-[0_-18px_40px_-30px_rgba(17,17,17,0.22)] backdrop-blur-xl">
        {navItems.map((item) => {
          const active = isActiveNavItem(item, location.pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[1.1rem] px-1 text-center transition ${
                active
                  ? "bg-[#171717] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                  : "text-[#5f574d] hover:bg-[#f6f0e8] hover:text-[#d61f26]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.4]" : "stroke-[2.1]"}`} />
              <span className="text-[0.6rem] font-semibold tracking-[0.04em] min-[390px]:text-[0.64rem]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default NativeAppBottomBar;
