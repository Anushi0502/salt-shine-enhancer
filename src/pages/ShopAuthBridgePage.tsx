import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { LoadingState } from "@/components/storefront/LoadState";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";

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
  const { isAuthenticated } = useCustomerAuth();
  const isOrdersIntent = shouldOpenOrders(location.pathname, location.search);
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const requestedReturnTarget =
    String(params.get("return_url") || params.get("return_to") || "").trim() || undefined;
  const targetPath = (() => {
    if (!requestedReturnTarget) {
      return isOrdersIntent
        ? isAuthenticated
          ? "/order-history"
          : buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "orders" })
        : buildCustomerAccessPath({ mode: "login", next: "/", reason: "account" });
    }

    try {
      const parsed = new URL(requestedReturnTarget, window.location.origin);
      const returnPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (/^\/account(\/|$)/i.test(returnPath)) {
        return isAuthenticated
          ? "/order-history"
          : buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "orders" });
      }

      return returnPath.startsWith("/") ? returnPath : "/";
    } catch {
      return isOrdersIntent
        ? isAuthenticated
          ? "/order-history"
          : buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "orders" })
        : buildCustomerAccessPath({ mode: "login", next: "/", reason: "account" });
    }
  })();

  useEffect(() => {
    if (!targetPath || typeof window === "undefined") {
      return;
    }

    window.location.replace(targetPath);
  }, [targetPath]);

  return (
    <LoadingState
      title={isOrdersIntent ? "Opening order history" : "Redirecting"}
      subtitle="Please wait while we continue to the storefront."
    />
  );
};

export default ShopAuthBridgePage;
