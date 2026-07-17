import { useEffect } from "react";
import { warmProductByHandle } from "@/lib/shopify-data";

let productPageModule: Promise<unknown> | null = null;

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
  warmProductByHandle(handle);
}

// One delegated listener accelerates every current and future product card.
// Desktop hover/focus normally finishes the request before click; pointerdown
// gives touch users the same in-flight promise during route navigation.
export default function ProductRoutePreloader() {
  useEffect(() => {
    document.addEventListener("pointerover", warmProductRoute, { passive: true });
    document.addEventListener("focusin", warmProductRoute);
    document.addEventListener("pointerdown", warmProductRoute, { passive: true });

    return () => {
      document.removeEventListener("pointerover", warmProductRoute);
      document.removeEventListener("focusin", warmProductRoute);
      document.removeEventListener("pointerdown", warmProductRoute);
    };
  }, []);

  return null;
}
