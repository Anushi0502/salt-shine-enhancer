import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { completeShopifyCustomerAccountSignInFromUrl } from "@/lib/shopify-customer-account";

function resolveTargetPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search || "");
  const requestedReturnTarget = String(params.get("return_url") || params.get("return_to") || "").trim();

  if (requestedReturnTarget) {
    try {
      const parsed = new URL(requestedReturnTarget, window.location.origin);
      const returnPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/account/orders";

      if (/^\/account(\/|$)/i.test(returnPath) && !/^\/account\/orders/i.test(returnPath)) {
        return "/account/orders";
      }

      return returnPath.startsWith("/") ? returnPath : "/account/orders";
    } catch {
      return "/account/orders";
    }
  }

  if (
    pathname.startsWith("/account") ||
    pathname.startsWith("/customer_authentication") ||
    pathname.startsWith("/services/login_with_shop")
  ) {
    return "/account/orders";
  }

  return "/";
}

const ShopAuthBridgePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const isCallback = params.has("code") || params.has("state") || params.has("error");
  const targetPath = useMemo(
    () => resolveTargetPath(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (isCallback) {
        try {
          const result = await completeShopifyCustomerAccountSignInFromUrl(params);
          if (!active) {
            return;
          }

          const target = result.returnTo || "/account/orders";
          const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (target !== currentRoute) {
            navigate(target, { replace: true });
          }
          return;
        } catch (error) {
          if (!active) {
            return;
          }

          setErrorMessage(error instanceof Error ? error.message : "Unable to complete Shopify sign-in");
          return;
        }
      }

      const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (targetPath !== currentRoute) {
        navigate(targetPath, { replace: true });
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [isCallback, navigate, params, targetPath]);

  if (errorMessage) {
    return (
      <ErrorState
        title="Shopify sign-in failed"
        subtitle={errorMessage}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/account/orders" className="salt-primary-cta h-11 px-5 text-sm font-bold">
              Open orders
            </Link>
            <Link to="/shop" className="salt-outline-chip h-11 px-5 text-sm font-bold">
              Continue shopping
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <LoadingState
      title={isCallback ? "Completing Shopify sign-in" : "Redirecting to order tracking"}
      subtitle={
        isCallback
          ? "Please wait while we finish the customer account callback."
          : "Please wait while we route you to the Shopify order dashboard."
      }
    />
  );
};

export default ShopAuthBridgePage;
