import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  Heart,
  LampDesk,
  ShieldCheck,
  Shirt,
  Sparkles,
  Stethoscope,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import CollectionCard from "@/components/storefront/CollectionCard";
import Reveal from "@/components/storefront/Reveal";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useCollections } from "@/lib/shopify-data";

type IntentId = "all" | "home-living" | "gifts-lifestyle" | "kitchen-utility" | "apparel" | "wellness-care";

type IntentConfig = {
  id: IntentId;
  label: string;
  description: string;
  keywords: string[];
  Icon: typeof Compass;
};

const intentConfigs: IntentConfig[] = [
  {
    id: "all",
    label: "All collections",
    description: "Full catalog coverage",
    keywords: [],
    Icon: Compass,
  },
  {
    id: "home-living",
    label: "Home and Living",
    description: "Decor, candles, and room picks",
    keywords: ["home", "living", "decor", "candle", "room", "furniture"],
    Icon: LampDesk,
  },
  {
    id: "gifts-lifestyle",
    label: "Gifts and Lifestyle",
    description: "Gift ideas and daily lifestyle picks",
    keywords: ["gift", "lifestyle", "festival", "party", "occasion"],
    Icon: Heart,
  },
  {
    id: "kitchen-utility",
    label: "Kitchen and Utility",
    description: "Cookware, tools, and practical utility",
    keywords: ["kitchen", "cook", "cookware", "utensil", "tool", "utility"],
    Icon: UtensilsCrossed,
  },
  {
    id: "apparel",
    label: "Apparel",
    description: "Clothing and wearable edits",
    keywords: ["apparel", "clothing", "shirt", "wear", "fashion"],
    Icon: Shirt,
  },
  {
    id: "wellness-care",
    label: "Wellness and Care",
    description: "Care, support, and everyday health",
    keywords: ["wellness", "care", "support", "health", "medical", "pet"],
    Icon: Stethoscope,
  },
];

function normalizeIntentText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveIntentId(title: string, handle: string): Exclude<IntentId, "all"> {
  const source = `${normalizeIntentText(title)} ${normalizeIntentText(handle)}`;
  const match = intentConfigs
    .filter((intent) => intent.id !== "all")
    .map((intent) => ({
      id: intent.id as Exclude<IntentId, "all">,
      score: intent.keywords.reduce((total, keyword) => {
        if (source.includes(keyword)) {
          return total + (keyword.length > 5 ? 2 : 1);
        }

        return total;
      }, 0),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!match || match.score <= 0) {
    return "home-living";
  }

  return match.id;
}

const CollectionsPage = () => {
  const { data, isLoading, error, refetch } = useCollections();
  const [activeIntent, setActiveIntent] = useState<IntentId>("all");
  const collections = useMemo(() => data?.collections ?? [], [data?.collections]);
  const collectionsWithIntent = useMemo(
    () =>
      collections.map((collection) => ({
        ...collection,
        intent: resolveIntentId(collection.title || "", collection.handle || ""),
      })),
    [collections],
  );
  const filteredCollections = useMemo(
    () =>
      activeIntent === "all"
        ? collectionsWithIntent
        : collectionsWithIntent.filter((collection) => collection.intent === activeIntent),
    [activeIntent, collectionsWithIntent],
  );
  const totalProducts = collections.reduce((sum, collection) => sum + collection.products_count, 0);
  const intentCountById = useMemo(
    () =>
      collectionsWithIntent.reduce<Record<IntentId, number>>(
        (accumulator, collection) => {
          accumulator.all += 1;
          accumulator[collection.intent] += 1;
          return accumulator;
        },
        {
          all: 0,
          "home-living": 0,
          "gifts-lifestyle": 0,
          "kitchen-utility": 0,
          apparel: 0,
          "wellness-care": 0,
        },
      ),
    [collectionsWithIntent],
  );
  const selectedIntent = intentConfigs.find((intent) => intent.id === activeIntent) || intentConfigs[0];

  if (isLoading) {
    return (
      <LoadingState
        title="Loading collections"
        subtitle="Preparing category tiles and product counts."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load collections"
        subtitle="Please try again."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <section className="mx-auto mt-5 w-[min(1200px,94vw)] pb-8 sm:mt-6 sm:w-[min(1200px,96vw)] sm:pb-10">
      <Reveal>
        <InnerBreadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Collections" },
          ]}
        />
      </Reveal>

      <Reveal>
        <div className="salt-editorial-shell relative mt-3 overflow-hidden rounded-[1.45rem] p-4 sm:rounded-[1.7rem] sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute left-0 top-8 h-14 w-1 rounded-r-full bg-primary/60" />
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 right-0 w-[36%] bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_58%)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:items-start">
            <div>
              <p className="inline-flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Curated collections
              </p>

              <h1 className="mt-3 max-w-[13ch] font-display text-[clamp(1.85rem,4.2vw,3.1rem)] leading-[0.95] tracking-[-0.04em] text-foreground">
                Shop by Collection Intent
              </h1>

              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                Pick your intent, then open the matching collection without browsing the full wall first.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-primary" />
                  {collectionsWithIntent.length.toLocaleString()} collections
                </span>
                <span className="text-border">|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {totalProducts.toLocaleString()} products
                </span>
                <span className="text-border">|</span>
                <span className="inline-flex items-center gap-1.5">
                  <selectedIntent.Icon className="h-3.5 w-3.5 text-primary" />
                  {intentCountById[activeIntent].toLocaleString()} in {selectedIntent.label}
                </span>
              </div>

              <div className="mt-3.5 flex flex-wrap items-center gap-3 text-xs">
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-primary transition hover:text-primary/80"
                >
                  Shop all products
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to="/shop?sort=newest"
                  className="inline-flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-primary"
                >
                  Shop newest
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-4 border-t border-border/75 pt-3.5">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Browse by intent
                </p>
              </div>

              <div className="-mx-1 mt-2.5 flex gap-4 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {intentConfigs.map((intent) => (
                  <button
                    key={intent.id}
                    type="button"
                    onClick={() => setActiveIntent(intent.id)}
                    className={
                      intent.id === activeIntent
                        ? "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-primary pb-1 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-primary"
                        : "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent pb-1 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-muted-foreground transition hover:border-primary/35 hover:text-primary"
                    }
                  >
                    <intent.Icon className="h-3.5 w-3.5" />
                    {intent.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:pl-6 lg:pt-1">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">
                Fast entry points
              </p>
              {topIntentCollections.length > 0 ? (
                <div className="mt-2.5 divide-y divide-border/70 border-t border-border/70">
                  {topIntentCollections.map((collection, index) => (
                    <Link
                      key={collection.id}
                      to={`/shop?collection=${collection.handle}`}
                      className="group flex items-start justify-between gap-4 py-3"
                    >
                      <div>
                        <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-primary">
                          {activeIntent === "all" ? `Top ${index + 1}` : "Top pick"}
                        </p>
                        <p className="mt-1 font-display text-[1.02rem] leading-tight text-foreground transition group-hover:text-primary">
                          {collection.title}
                        </p>
                        <p className="mt-1 text-[0.72rem] font-medium text-muted-foreground">
                          {collection.products_count.toLocaleString()} products
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-2.5 border-t border-dashed border-border/80 py-4 text-sm text-muted-foreground">
                  No collections currently mapped to this intent. Switch intent to continue browsing.
                </div>
              )}
            </div>
          </div>

        </div>
      </Reveal>

      <Reveal delayMs={80}>
        <SectionHeading
          className="mt-6"
          kicker="Collection index"
          title={activeIntent === "all" ? "Explore the full collection wall" : `Explore ${selectedIntent.label}`}
          description={
            activeIntent === "all"
              ? "A cleaner browse inspired by the storefront visual language, with stronger spacing, clearer grouping, and easier scanning across every collection tile."
              : `${intentCountById[activeIntent].toLocaleString()} collections are currently grouped under this shopping intent.`
          }
        />
      </Reveal>

      <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCollections.length ? (
          filteredCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 60}>
              <CollectionCard
                collection={collection}
              />
            </Reveal>
          ))
        ) : (
          <Reveal>
            <article className="salt-panel-shell col-span-full rounded-[1.45rem] p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">No mapped collections</p>
              <h3 className="mt-2 font-display text-[clamp(1.4rem,2.6vw,2rem)]">Try another collection intent</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This intent currently has no assigned collections in live catalog metadata.
              </p>
              <button
                type="button"
                onClick={() => setActiveIntent("all")}
                className="salt-primary-cta mt-4 h-10 px-4 text-[0.66rem] font-bold uppercase tracking-[0.08em]"
              >
                View all collections
              </button>
            </article>
          </Reveal>
        )}
      </div>

      <Reveal delayMs={140}>
        <div className="salt-surface-strong relative mt-10 overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <div className="absolute inset-y-0 right-0 w-[32%] bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.22),transparent_55%)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
                Need a faster way in?
              </p>
              <h2 className="mt-2 max-w-[12ch] font-display text-[clamp(1.9rem,3vw,3rem)] leading-[0.94] tracking-[-0.05em] text-foreground">
                Open the full catalog and refine from there
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                Jump into the complete product view, then filter by collection, type, or value to find the right edit faster.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                to="/shop"
                className="salt-primary-cta inline-flex h-11 w-full items-center justify-center px-5 text-[0.72rem] font-bold uppercase tracking-[0.12em] sm:w-auto"
              >
                Open full catalog
              </Link>
              <Link
                to="/shop?sort=discount"
                className="salt-outline-chip inline-flex h-11 w-full items-center justify-center px-5 py-0 text-[0.72rem] font-bold uppercase tracking-[0.12em] sm:w-auto"
              >
                Shop best savings
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CollectionsPage;
