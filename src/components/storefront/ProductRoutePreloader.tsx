import { useEffect } from "react";

let productPageModule: Promise<unknown> | null = null;
const warmedHandles = new Set<string>();

type ProductWarmWindow = Window & {
  __SALT_PRODUCT_ROUTE_WARM__?: Record<string, Promise<Record<string, unknown>>>;
};

function warmProductRoute(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>('a[href^="/product/"][href],a[href^="/products/"][href]');
  if (!link) return;
  const match = new URL(link.href, window.location.origin).pathname.match(/^\/products?\/([^/?#]+)\/?$/i);
  const handle = match ? decodeURIComponent(match[1]).trim().toLowerCase() : "";
  if (!handle) return;
  productPageModule ??= import("@/pages/ProductPage");
  if (warmedHandles.has(handle)) return;
  warmedHandles.add(handle);
  const request = fetch(`/products/${encodeURIComponent(handle)}.js`, {
    cache: "force-cache",
    credentials: "same-origin",
  }).then((response) => {
    if (!response.ok) throw new Error(`Product warmup failed (${response.status})`);
    return response.json() as Promise<Record<string, unknown>>;
  });
  const warmWindow = window as ProductWarmWindow;
  warmWindow.__SALT_PRODUCT_ROUTE_WARM__ ||= {};
  warmWindow.__SALT_PRODUCT_ROUTE_WARM__[handle] = request;
  void request.catch(() => {
    warmedHandles.delete(handle);
    delete warmWindow.__SALT_PRODUCT_ROUTE_WARM__?.[handle];
  });
}

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
