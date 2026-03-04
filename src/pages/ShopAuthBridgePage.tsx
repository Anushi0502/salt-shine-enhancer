import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { LoadingState } from "@/components/storefront/LoadState";
import { buildShopLoginUrl, getShopifyAccountRoutes } from "@/lib/theme-assets";

function shouldOpenOrders(pathname: string, search: string): boolean {
  const normalizedPath = String(pathname || "").toLowerCase();
  if (normalizedPath.includes("/orders")) {
    return true;
  }

  const params = new URLSearchParams(search || "");
  const returnTo = String(params.get("return_to") || "").toLowerCase();
  const returnUrl = String(params.get("return_url") || "").toLowerCase();
  const combined = `${returnTo} ${returnUrl}`;
  return combined.includes("/account/orders");
}

const ShopAuthBridgePage = () => {
  const location = useLocation();
  const accountRoutes = useMemo(() => getShopifyAccountRoutes(), []);
  const isOrdersIntent = shouldOpenOrders(location.pathname, location.search);
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const requestedReturnTarget =
    String(params.get("return_url") || params.get("return_to") || "").trim() || undefined;
  const defaultReturnTarget = isOrdersIntent ? accountRoutes.orders : accountRoutes.account;
  const returnTarget = requestedReturnTarget || defaultReturnTarget;
  const targetUrl = accountRoutes.isLoggedIn ? returnTarget : buildShopLoginUrl(returnTarget);

  useEffect(() => {
    if (!targetUrl || typeof window === "undefined") {
      return;
    }

    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <LoadingState
      title={isOrdersIntent ? "Opening order history" : "Redirecting to Shop login"}
      subtitle="Please wait while we connect you to your secure Shop account flow."
    />
  );
};

export default ShopAuthBridgePage;
