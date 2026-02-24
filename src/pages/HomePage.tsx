import { Link } from "react-router-dom";
import HomeHero from "@/components/storefront/HomeHero";
import CollectionCard from "@/components/storefront/CollectionCard";
import KpiStrip from "@/components/storefront/KpiStrip";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useCollections, useProducts } from "@/lib/shopify-data";

const trustBullets = [
  "Fast US fulfillment and dependable shipping updates",
  "Secure checkout and encrypted payment processing",
  "30-day returns on eligible products",
  "Curated launches every week across key categories",
];

const HomePage = () => {
  const {
    data: productsPayload,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts();

  const {
    data: collectionsPayload,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections();

  if (productsLoading || collectionsLoading) {
    return (
      <LoadingState
        title="Loading SALT catalog"
        subtitle="Preparing products, collections, and featured recommendations."
      />
    );
  }

  if (productsError || collectionsError) {
    return (
      <ErrorState
        title="We could not load the storefront"
        subtitle="Please retry. If the issue continues, the embedded fallback catalog will still appear on refresh."
        action={
          <button
            type="button"
            onClick={() => {
              refetchProducts();
              refetchCollections();
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const products = productsPayload?.products || [];
  const collections = collectionsPayload?.collections || [];
  const featured = products.slice(0, 3);
  const featuredGrid = products.slice(0, 8);
  const featuredCollections = collections.slice(0, 8);

  return (
    <>
      <HomeHero featured={featured} />
      <KpiStrip products={products} collections={collections} />

      <section id="collections" className="mx-auto mt-10 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Explore</p>
              <h2 className="font-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[1.02]">
                Collections Reimagined
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Shop category-led experiences inspired by the original v1 layout and elevated with the v2 editorial system.
              </p>
            </div>
            <Link
              to="/collections"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/50 hover:text-primary"
            >
              View all collections
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 80}>
              <CollectionCard collection={collection} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto mt-14 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Featured</p>
              <h2 className="font-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[1.02]">
                Best of SALT This Week
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Directly sourced from your Shopify catalog with resilient fallbacks for consistent rendering.
              </p>
            </div>
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110"
            >
              Shop full catalog
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredGrid.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 70}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 w-[min(1280px,96vw)] rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7">
        <Reveal>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-tight">
                Built for conversion without losing the SALT identity
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                This merged build carries forward v1 warmth, v2 clarity, and production-grade route/data behavior. Customers get
                faster discovery, clearer purchase paths, and stronger trust messaging across every key page.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {trustBullets.map((item) => (
                  <p key={item} className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-salt-olive/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Ready to launch</p>
              <h4 className="mt-2 font-display text-2xl leading-tight">Need updates deployed to GitHub?</h4>
              <p className="mt-3 text-sm text-muted-foreground">
                I can prepare clean commits and push once you authenticate access for the target repository.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to="/contact"
                  className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
                >
                  Contact support
                </Link>
                <Link
                  to="/shop"
                  className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
                >
                  Continue shopping
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default HomePage;
