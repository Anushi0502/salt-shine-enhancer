import { useEffect } from "react";

let productPageModule: Promise<unknown> | null = null;
let shopifyDataModule: Promise<typeof import("@/lib/shopify-data")> | null = null;

function productHandleFromEvent(event: Event): string {
  const target = event.target;
  if (!(target instanceof Element)) {
    return "";
  }

  const link = target.closest<HTMLAnchorElement>('a[href^="/product/"][href],a[href^="/products/"][href]');
  if (!link) {
    return "";
  }

  try {
    const match = new URL(link.href, window.location.origin).pathname.match(/^\/products?\/([^/?#]+)\/?$/i);
    return match ? decodeURIComponent(match[1]).trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

function warmProductRoute(event: Event) {
  const handle = productHandleFromEvent(event);
  if (!handle) {
    return;
  }

  productPageModule ??= import("@/pages/ProductPage");
  shopifyDataModule ??= import("@/lib/shopify-data");
  void shopifyDataModule.then(({ warmProductByHandle }) => {
    warmProductByHandle(handle);
  });
}

// Preload only on an intentional interaction. A document-level pointerover
// listener made ordinary cursor movement across a product grid start the PDP
// chunk and product-data request, which made the storefront feel heavy before
// the shopper had selected anything.
export default function ProductRoutePreloader() {
  useEffect(() => {
    document.addEventListener("focusin", warmProductRoute);
    document.addEventListener("pointerdown", warmProductRoute, { passive: true });

    return () => {
      document.removeEventListener("focusin", warmProductRoute);
      document.removeEventListener("pointerdown", warmProductRoute);
    };
  }, []);

  return null;
}
