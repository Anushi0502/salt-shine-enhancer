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
        <div className="salt-editorial-shell relative mt-3 overflow-hidden rounded-[1.35rem] p-4 sm:rounded-[1.7rem] sm:p-5">
          <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/55" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,hsl(var(--primary)/0.1),transparent_30%),radial-gradient(circle_at_88%_14%,hsl(var(--salt-gold)/0.1),transparent_32%),linear-gradient(160deg,rgba(247,250,255,0.94),rgba(244,248,255,0.9))]" />

          <div className="relative">
            <span className="salt-editorial-pill">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Collection browse
            </span>
            <SectionHeading
              className="mt-3"
              title={activeIntent === "all" ? "Shop by Collection Intent" : `Shop ${selectedIntent.label}`}
              description={
                activeIntent === "all"
                  ? "Use collections as your first step, then drill into products with cleaner navigation."
                  : `${selectedIntent.description}. Open the matching collection tiles below.`
              }
              action={
                <p className="salt-editorial-meta">
                  {filteredCollections.length.toLocaleString()} shown | {totalProducts.toLocaleString()} products
                </p>
              }
            />
            <TrustStrip
              className="mt-4"
              items={[
                { icon: Truck, label: "US shipping included" },
                { icon: ShieldCheck, label: "Secure checkout" },
                { icon: Sparkles, label: "Curated by category" },
              ]}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delayMs={72}>
        <div className="salt-filter-shell mt-4 rounded-[1.05rem] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Browse by intent | {intentCountById[activeIntent].toLocaleString()} collections
            </p>
            <Link to="/shop" className="salt-outline-chip h-8 px-3 py-0 text-[0.62rem]">
              Shop all products
            </Link>
          </div>

          <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {intentConfigs.map((intent) => (
              <button
                key={intent.id}
                type="button"
                onClick={() => setActiveIntent(intent.id)}
                className={
                  intent.id === activeIntent
                    ? "salt-primary-cta inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-[0.62rem] font-bold uppercase tracking-[0.08em]"
                    : "salt-outline-chip inline-flex h-9 shrink-0 items-center gap-1.5 px-3 py-0 text-[0.62rem] font-bold uppercase tracking-[0.08em]"
                }
              >
                <intent.Icon className="h-3.5 w-3.5" />
                {intent.label}
              </button>
            ))}
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
              ? "A storefront-aligned collection wall with cleaner spacing and faster scanning."
              : `${intentCountById[activeIntent].toLocaleString()} collections are currently grouped under this shopping intent.`
          }
        />
      </Reveal>

      <div className="salt-section-shell mt-5 rounded-[1.55rem] p-3 sm:mt-6 sm:rounded-[2rem] sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
      </div>
    </section>
  );
};

export default CollectionsPage;

