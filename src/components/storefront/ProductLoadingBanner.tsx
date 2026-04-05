import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

const LEGACY_PLANNER_BANNER_IMAGE =
  "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/7.png?v=1772179925";
const LEGACY_PLANNER_PRODUCT_ENDPOINT =
  "https://0309d3-72.myshopify.com/products/the-living-legacy-planner-2nd-edition.json";
const LEGACY_PLANNER_PRODUCT_PATH = "/products/the-living-legacy-planner-2nd-edition";

type ProductLoadingBannerProps = {
  imageSrc?: string | null;
};

type PlannerProductPayload = {
  product?: {
    image?: {
      src?: string | null;
    } | null;
    images?: Array<{
      src?: string | null;
    }>;
  };
};

function withCacheBust(url: string): string {
  if (!url) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}salt_ts=${Date.now()}`;
}

const ProductLoadingBanner = ({ imageSrc }: ProductLoadingBannerProps) => {
  const initialImage = normalizeShopifyAssetUrl(imageSrc) || LEGACY_PLANNER_BANNER_IMAGE;
  const [resolvedImage, setResolvedImage] = useState(() => withCacheBust(initialImage));

  useEffect(() => {
    setResolvedImage(withCacheBust(initialImage));
  }, [initialImage]);

  useEffect(() => {
    let cancelled = false;

    const fetchLivePlannerImage = async () => {
      try {
        const response = await fetch(
          `${LEGACY_PLANNER_PRODUCT_ENDPOINT}?salt_ts=${Date.now()}`,
          {
            headers: {
              accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PlannerProductPayload;
        const liveImage =
          normalizeShopifyAssetUrl(payload.product?.images?.[0]?.src) ||
          normalizeShopifyAssetUrl(payload.product?.image?.src) ||
          null;

        if (!cancelled && liveImage) {
          setResolvedImage(withCacheBust(liveImage));
        }
      } catch {
        // Keep the current showcase image if live Shopify fetch fails.
      }
    };

    fetchLivePlannerImage();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto mt-6 w-[min(1280px,94vw)]">
      <div className="rounded-[2.4rem] border border-[#2b3344] bg-[#171b24] p-3 shadow-[0_50px_140px_-72px_rgba(15,23,42,0.72)] sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="relative min-h-[22rem] overflow-hidden rounded-[2rem] border border-white/6 bg-[#101520] lg:min-h-[34rem]">
            <img
              src={resolvedImage}
              alt="The Living Legacy Planner 2nd Edition"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(14,20,34,0.18),rgba(14,20,34,0.06)_38%,rgba(14,20,34,0.3)),radial-gradient(circle_at_14%_18%,rgba(255,203,46,0.2),transparent_28%)]" />
          </div>

          <div className="flex min-h-[22rem] flex-col justify-center rounded-[1.8rem] border border-[#3a4357] bg-[linear-gradient(180deg,#222632,#1a1e28)] px-6 py-7 text-white lg:min-h-[34rem] lg:px-8 lg:py-8">
            <h1 className="mt-4 max-w-[13ch] font-display text-[clamp(2.2rem,4vw,3.75rem)] leading-[0.96] tracking-[-0.045em] text-white">
              The Living Legacy Planner 2nd Edition
            </h1>
            <p className="mt-4 max-w-[26rem] text-base leading-7 text-white/74 lg:text-lg">
              Courtney R. Jones' signature planner for memory keeping, legacy planning, and thoughtful family preparation.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                to={LEGACY_PLANNER_PRODUCT_PATH}
                className="inline-flex h-12 items-center rounded-full bg-[#f3c62f] px-6 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#101522] shadow-[0_20px_45px_-28px_rgba(243,198,47,0.9)] transition hover:-translate-y-[1px] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c62f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1e28]"
              >
                Explore the planner
              </Link>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/66">
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening SALT
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductLoadingBanner;
