import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Sparkles, Star, Truck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

type HomeHeroProps = {
  featured: ShopifyProduct[];
  leadCollection?: ShopifyCollection | null;
  supportingCollections?: ShopifyCollection[];
};

const heroStats = [
  { label: "Curated weekly", icon: Sparkles },
  { label: "Gift-ready", icon: BadgeCheck },
  { label: "Fast dispatch", icon: Truck },
];

const HomeHero = ({ featured, leadCollection, supportingCollections = [] }: HomeHeroProps) => {
  const collectionImage = normalizeShopifyAssetUrl(leadCollection?.image?.src);
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured ?? [];
  const spotlightProducts = [secondaryProduct, tertiaryProduct].filter(Boolean) as ShopifyProduct[];

  return (
    <section className="mx-auto mt-4 grid w-[min(1340px,94vw)] grid h-[56vw] gap-3 xl:grid-cols-[1.12fr_0.88fr]">
      <Reveal>
        <div className="salt-ink-panel h-[56vw] relative isolate overflow-hidden rounded-[2.35rem] px-5 py-6 text-[hsl(var(--salt-paper))] shadow-[0_44px_120px_-72px_rgba(15,23,42,0.6)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">
          {collectionImage ? (
            <img
              src={collectionImage}
              alt={leadCollection?.title || "Featured collection"}
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,29,52,0.9),rgba(20,29,52,0.72)_42%,rgba(20,29,52,0.84)),radial-gradient(circle_at_14%_16%,rgba(244,196,48,0.18),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(77,125,255,0.16),transparent_24%)]" />
          <div className="pointer-events-none absolute inset-[1.15rem] rounded-[2rem] border border-white/10" />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BrandLogo
                size="sm"
                withWordmark
                className="rounded-full border border-white/10 bg-white/8 px-3 py-2 backdrop-blur"
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
                New edit
              </span>
            </div>

            <div className="mt-6 max-w-[40rem]">
              <h1 className="mt-4 max-w-[15ch] font-display text-[clamp(3rem,5vw,5rem)] leading-[1.2] tracking-[-0.05em] text-white">
                Curated pieces for home, gifting, and beautifully useful days.
              </h1>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={leadCollection ? `/shop?collection=${leadCollection.handle}` : "/collections"}
                className="salt-primary-cta inline-flex h-12 items-center gap-2 rounded-full px-6 text-[0.76rem] font-semibold uppercase tracking-[0.14em]"
              >
                {leadCollection ? `Shop ${leadCollection.title}` : "Shop collections"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/shop?sort=newest"
                className="inline-flex h-12 items-center rounded-full border border-white/16 bg-white/8 px-6 text-[0.76rem] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-[hsl(var(--salt-ink))]"
              >
                Browse new arrivals
              </Link>
            </div>


            <div className="mt-5 flex flex-wrap gap-2">
              {heroStats.map((item) => {
                const Icon = item.icon;

                return (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/78 backdrop-blur"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {item.label}
                  </span>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 ">

              {mainProduct ? (
                <Link
                  to={`/products/${mainProduct.handle}`}
                  className="group flex items-center gap-4 rounded-[1.8rem] border border-white/10 bg-white/8 p-4 backdrop-blur transition hover:border-primary/35 hover:bg-white/[0.11]"
                >
                  <div className="h-28 w-24 overflow-hidden rounded-[1.25rem] bg-white/10 sm:h-32 sm:w-28">
                    {productImage(mainProduct) ? (
                      <img
                        src={productImage(mainProduct) || ""}
                        alt={mainProduct.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      Featured this week
                    </p>
                    <p className="mt-2 line-clamp-2 font-display text-[1.6rem] leading-[1.02] text-white">
                      {mainProduct.title}
                    </p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="mt-1 font-display text-2xl text-white">
                          {formatMoney(minPrice(mainProduct))}
                        </p>
                      </div>
                      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-white/82">
                        View
                      </span>
                    </div>
                  </div>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
  {spotlightProducts.map((product, index) => {
    const image = productImage(product);

    return (
      <Reveal key={product.id} delayMs={120 + index * 120}>
        <Link
          to={`/products/${product.handle}`}
          className="group relative flex h-full min-h-[23rem] gap-4 overflow-hidden rounded-[1.9rem] border border-white/10 bg-[rgba(14,18,28,0.62)] p-4 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.9)] backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_32px_90px_-54px_rgba(15,23,42,1)] xl:min-h-[24.5rem]"
        >
          {image ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center opacity-22 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-28"
                style={{ backgroundImage: `url(${image})` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,14,24,0.84),rgba(10,14,24,0.58)_42%,rgba(10,14,24,0.8)),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_34%)]" />
            </>
          ) : null}
          <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_50%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_32%)]" />
          </div>

          

          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <p className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Spotlight pick
              </p>

              <span className="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-white/72 transition group-hover:text-white">
                New edit
              </span>
            </div>

            <h3 className="mt-3 max-w-[18ch] font-display text-[2rem] leading-[0.96] tracking-[-0.04em] text-white sm:text-[2.68rem] xl:text-[2.82rem]">
              {product.title}
            </h3>

            <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/8 pt-4">
              <div>
                <strong className="mt-1 block font-display text-[1.75rem] leading-none text-white">
                  {formatMoney(minPrice(product))}
                </strong>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-primary transition duration-300 group-hover:border-primary/20 group-hover:bg-primary/12 group-hover:text-primary">
                Shop now
                <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      </Reveal>
    );
  })}
</div>
    </section>
  );
};

export default HomeHero;
