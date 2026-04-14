import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Gift,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import HomeHero from "@/components/storefront/HomeHero";
import CollectionCard from "@/components/storefront/CollectionCard";
import ProductLoadingBanner from "@/components/storefront/ProductLoadingBanner";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState } from "@/components/storefront/LoadState";
import { useMinimumDelay } from "@/hooks/useMinimumDelay";
import { savingsPercent } from "@/lib/formatters";
import { useJudgeMeRatings } from "@/lib/judgeme";
import {
  useCollectionProductIds,
  useCollections,
  useProducts,
} from "@/lib/shopify-data";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { ShopifyCollection } from "@/types/shopify";

function collectionCtaLabel(title: string): string {
  const normalized = String(title || "").trim();
  if (!normalized) {
    return "Shop collection";
  }

  if (normalized.length <= 26) {
    return `Shop ${normalized}`;
  }

  return "Shop this collection";
}

function isBestSellersCollection(collection: ShopifyCollection): boolean {
  return /best[\s-]*seller/i.test(`${collection.title} ${collection.handle}`);
}

function isUtilityCollection(collection: ShopifyCollection): boolean {
  return /all[\s-]*products?/i.test(`${collection.title} ${collection.handle}`);
}

function matchesCollectionPattern(collection: ShopifyCollection, patterns: RegExp[]): boolean {
  const haystack = `${collection.title} ${collection.handle} ${collection.description}`;
  return patterns.some((pattern) => pattern.test(haystack));
}

type RankedCollection = ShopifyCollection & {
  effectiveCount: number;
};

type CategoryCard = {
  title: string;
  description: string;
  eyebrow: string;
  to: string;
  image: string | null;
};

const HomePage = () => {
  const {
    data: productsPayload,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts();

  const {
    data: collectionsPayload,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections();

  const homeLoadDelayElapsed = useMinimumDelay(5000);

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const isInitialProductsSync = productsLoading && !productsPayload;


  const rankedCollections: RankedCollection[] = collections
    .map((collection) => ({
      ...collection,
      effectiveCount: collection.products_count,
    }))
    .sort((a, b) => {
      if (b.effectiveCount !== a.effectiveCount) {
        return b.effectiveCount - a.effectiveCount;
      }

      return (
        new Date(b.updated_at || b.published_at || "1970-01-01").getTime() -
        new Date(a.updated_at || a.published_at || "1970-01-01").getTime()
      );
    });

  const merchCollections = rankedCollections.filter(
    (collection) => collection.effectiveCount > 0 && !isUtilityCollection(collection),
  );

  const findCollection = (patterns: RegExp[]) =>
    merchCollections.find((collection) => matchesCollectionPattern(collection, patterns)) || null;

  const featured = products.slice(0, 3);
  const heroCollection =
    merchCollections.find((collection) => isBestSellersCollection(collection)) ||
    findCollection([/new[\s-]*arrivals/i, /summer/i]) ||
    merchCollections[0] ||
    null;
  const focusCollection = heroCollection;
  const kitchenCollection = findCollection([/cookware/i, /kitchen/i, /cooking/i]);
  const homeCollection = findCollection([/home/i, /decor/i, /candles/i]);
  const giftsCollection = findCollection([/^gifts?$/i, /gift/i, /unique-products/i]);
  const wellnessCollection = findCollection([/personal-care/i, /wellness/i, /care/i, /medical/i]);
  const seasonalCollection =
    findCollection([/new[\s-]*arrivals/i, /summer/i]) || homeCollection || kitchenCollection || focusCollection;

  const categoryCards: CategoryCard[] = [
    {
      title: "Kitchen",
      description: "Cookware, prep tools, and everyday kitchen helpers that feel simple to shop.",
      eyebrow: "Easy cooking essentials",
      to: kitchenCollection ? `/collections/${kitchenCollection.handle}` : "/shop?q=kitchen",
      image: normalizeShopifyAssetUrl(kitchenCollection?.image?.src),
    },
    {
      title: "Home",
      description: "Decor, candles, and practical home finds curated to feel calm and giftable.",
      eyebrow: "Warm home updates",
      to: homeCollection ? `/collections/${homeCollection.handle}` : "/shop?q=home",
      image: normalizeShopifyAssetUrl(homeCollection?.image?.src),
    },
    {
      title: "Gifts",
      description: "Thoughtful gift-ready picks that help mixed-category browsing feel more intentional.",
      eyebrow: "Gift-friendly discovery",
      to: giftsCollection ? `/collections/${giftsCollection.handle}` : "/shop?q=gift",
      image: normalizeShopifyAssetUrl(giftsCollection?.image?.src),
    },
    {
      title: "Wellness",
      description: "Personal care and feel-good essentials presented in a clean, easy-to-scan way.",
      eyebrow: "Everyday care",
      to: wellnessCollection ? `/collections/${wellnessCollection.handle}` : "/shop?q=wellness",
      image: normalizeShopifyAssetUrl(wellnessCollection?.image?.src),
    },
  ];

  const giftDiscoveryLinks = [
    {
      title: "Gifts Under $25",
      description: "Budget-friendly finds that still feel thoughtful and easy to give.",
      to: "/shop?max=25",
    },
    {
      title: "Gifts for Her",
      description: "Practical, giftable picks across apparel, decor, and everyday lifestyle finds.",
      to: "/shop?q=women",
    },
    {
      title: "Gifts for Him",
      description: "Useful everyday products selected for practical shoppers and easy gifting.",
      to: "/shop?q=men",
    },
    {
      title: "Housewarming Picks",
      description: "Home, kitchen, and decor pieces that work beautifully for new-space gifting.",
      to: homeCollection ? `/collections/${homeCollection.handle}` : "/shop?q=home",
    },
    {
      title: "Unique Finds",
      description: "Interesting lifestyle products that help SALT feel selected rather than overwhelming.",
      to: giftsCollection ? `/collections/${giftsCollection.handle}` : "/shop?q=unique",
    },
  ];

  const trustPoints = [
    { title: "Fast Shipping", copy: "Clear, confidence-building delivery expectations for daily-use finds.", icon: Truck },
    { title: "Secure Checkout", copy: "A cleaner Shopify buying flow that feels safe and trustworthy.", icon: ShieldCheck },
    { title: "Easy Returns", copy: "A calmer post-purchase promise that reduces hesitation before buying.", icon: BadgeCheck },
    { title: "Friendly Support", copy: "Approachable help for shoppers who want a simple, guided experience.", icon: HeartHandshake },
  ];

  const testimonials = [
    {
      quote: "The layout feels much easier to shop. I found gifts and kitchen items without digging through pages.",
      name: "Maya R.",
      meta: "Verified SALT shopper",
    },
    {
      quote: "It finally feels like a curated store instead of a random catalog. The product cards are much clearer.",
      name: "Jordan T.",
      meta: "Repeat customer",
    },
    {
      quote: "I like how quickly I can scan categories, trust the checkout, and move straight to products I want.",
      name: "Avery L.",
      meta: "First-time shopper",
    },
  ];
  const {
    data: focusCollectionProductIdsPayload,
  } = useCollectionProductIds(
    focusCollection?.handle || "",
    Boolean(focusCollection?.handle),
  );

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const focusedCollectionProducts = useMemo(() => {
    const ids = focusCollectionProductIdsPayload?.productIds || [];
    if (!ids.length) {
      return [];
    }

    return ids
      .map((id) => productById.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }, [focusCollectionProductIdsPayload, productById]);

  const focusRatingCandidateIds = useMemo(
    () => focusedCollectionProducts.slice(0, 80).map((product) => product.id),
    [focusedCollectionProducts],
  );
  const { data: focusCollectionRatings } = useJudgeMeRatings(focusRatingCandidateIds);

  const focusProducts = useMemo(() => {
    const fallback = [...products]
      .sort((a, b) => {
        const discountDelta = savingsPercent(b) - savingsPercent(a);
        if (discountDelta !== 0) {
          return discountDelta;
        }

        return (
          new Date(b.updated_at || b.published_at || b.created_at || "1970-01-01").getTime() -
          new Date(a.updated_at || a.published_at || a.created_at || "1970-01-01").getTime()
        );
      })
      .slice(0, 8);

    if (!focusCollection || !focusedCollectionProducts.length) {
      return fallback;
    }

    const rankedByRating = [...focusedCollectionProducts]
      .sort((a, b) => {
        const left = focusCollectionRatings?.[a.id];
        const right = focusCollectionRatings?.[b.id];

        const leftHasReviews = (left?.reviewCount || 0) > 0;
        const rightHasReviews = (right?.reviewCount || 0) > 0;
        if (leftHasReviews !== rightHasReviews) {
          return rightHasReviews ? 1 : -1;
        }

        const ratingDelta = (right?.rating || 0) - (left?.rating || 0);
        if (Math.abs(ratingDelta) > 0.01) {
          return ratingDelta;
        }

        const reviewCountDelta = (right?.reviewCount || 0) - (left?.reviewCount || 0);
        if (reviewCountDelta !== 0) {
          return reviewCountDelta;
        }

        const discountDelta = savingsPercent(b) - savingsPercent(a);
        if (discountDelta !== 0) {
          return discountDelta;
        }

        return (
          new Date(b.updated_at || b.published_at || b.created_at || "1970-01-01").getTime() -
          new Date(a.updated_at || a.published_at || a.created_at || "1970-01-01").getTime()
        );
      })
      .slice(0, 8);

    return rankedByRating.length ? rankedByRating : fallback;
  }, [focusCollection, focusCollectionRatings, focusedCollectionProducts, products]);

  const focusShopLink = focusCollection
    ? `/shop?collection=${focusCollection.handle}`
    : "/shop";
  const focusShopLabel = focusCollection
    ? collectionCtaLabel(focusCollection.title)
    : "Shop full catalog";
  const focusBestValueLink = focusCollection
    ? `/shop?collection=${focusCollection.handle}&sort=discount`
    : "/shop?sort=discount";
  if (!homeLoadDelayElapsed || isInitialProductsSync) {
    return (
      <ProductLoadingBanner />
    );
  }

  if (productsError && !productsPayload) {
    return (
      <ErrorState
        title="We could not load the storefront"
        subtitle="Please retry to pull the latest live catalog data."
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

  return (
    <>
      <HomeHero
        featured={featured}
        leadCollection={focusCollection}
      />

      <section id="collections" className="mx-auto mt-20 w-full max-w-[1340px] px-4 sm:mt-24">
        <Reveal>
          <div className="mb-12 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-primary">Shop by category</span>
              <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05] text-[#1a1a1a]">
                Curated essentials for every room
              </h2>
            </div>
            <Link to="/collections" className="text-[0.76rem] font-bold uppercase tracking-[0.15em] text-[#1a1a1a] border-b-2 border-[#1a1a1a] pb-1 transition-colors hover:text-primary hover:border-primary">
              Explore all categories
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categoryCards.map((category, index) => (
            <Reveal key={category.title} delayMs={index * 100}>
              <Link
                to={category.to}
                className="group relative block aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#f8f5f0]"
              >
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#efeae2]" />
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                
                <div className="absolute inset-x-0 bottom-0 p-8">
                  <h3 className="font-display text-2xl text-white">
                    {category.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/80 line-clamp-2">
                    {category.description}
                  </p>
                  <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1a1a1a] transition-transform duration-300 group-hover:translate-x-2">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto mt-24 w-full max-w-[1340px] px-4 sm:mt-32">
        <Reveal>
          <div className="mb-12 text-center">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-primary">Best Sellers</span>
            <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05] text-[#1a1a1a]">
              The most loved pieces on SALT right now
            </h2>
          </div>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {focusProducts.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 80} className="h-full">
              <ProductCard product={product} variant="dense" />
            </Reveal>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <Link to={focusShopLink} className="inline-flex h-14 items-center justify-center rounded-full bg-[#1a1a1a] px-12 text-[0.76rem] font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-primary">
            {focusShopLabel}
          </Link>
        </div>
      </section>

      <section className="bg-[#fdfbf7] py-24 mt-24 sm:mt-32">
        <div className="mx-auto w-full max-w-[1340px] px-4">
          <Reveal>
            <div className="mb-12 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-primary">Gift Discovery</span>
                <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05] text-[#1a1a1a]">
                  Thoughtful finds for everyone
                </h2>
              </div>
              <Link to="/shop?q=gift" className="text-[0.76rem] font-bold uppercase tracking-[0.15em] text-[#1a1a1a] border-b-2 border-[#1a1a1a] pb-1 transition-colors hover:text-primary hover:border-primary">
                Shop all gifts
              </Link>
            </div>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {giftDiscoveryLinks.map((item, index) => (
              <Reveal key={item.title} delayMs={index * 80}>
                <Link
                  to={item.to}
                  className="group flex h-full flex-col rounded-[1.5rem] bg-white p-8 transition-all hover:shadow-xl hover:shadow-[#1a1a1a]/5"
                >
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#f8f5f0] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Gift className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl text-[#1a1a1a]">
                    {item.title}
                  </h3>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-[#4a453e]/80">
                    {item.description}
                  </p>
                  <div className="mt-6 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary transition-transform group-hover:translate-x-1">
                    Discover <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 w-full max-w-[1340px] px-4 sm:mt-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <div className="max-w-xl">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-primary">Our Promise</span>
              <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05] text-[#1a1a1a]">
                The SALT difference
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-[#4a453e]/90">
                We believe shopping should be as calm and intentional as the home you're building. Every piece in our collection is selected for quality, utility, and simple beauty.
              </p>
              
              <div className="mt-12 grid gap-8 sm:grid-cols-2">
                {trustPoints.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex flex-col items-start">
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f5f0] text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-display text-lg text-[#1a1a1a]">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#4a453e]/80">{item.copy}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>
          
          <Reveal delayMs={200}>
            <div className="relative aspect-square overflow-hidden rounded-[2.5rem] bg-[#f8f5f0]">
              <img 
                src="https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=2070&auto=format&fit=crop" 
                alt="Lifestyle" 
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#1a1a1a] py-24 mt-24 sm:mt-32 text-white">
        <div className="mx-auto w-full max-w-[1340px] px-4">
          <Reveal>
            <div className="mb-16 text-center">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-primary">Kind Words</span>
              <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05]">
                What our community says
              </h2>
            </div>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-3">
            {testimonials.map((item, index) => (
              <Reveal key={item.name} delayMs={index * 100}>
                <div className="flex h-full flex-col border border-white/10 p-10 rounded-[2rem]">
                  <p className="text-xl italic leading-relaxed text-white/90">
                    "{item.quote}"
                  </p>
                  <div className="mt-8">
                    <p className="font-bold text-sm uppercase tracking-[0.2em]">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-white/50 uppercase tracking-[0.1em]">
                      {item.meta}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      </>
  );
};

export default HomePage;
