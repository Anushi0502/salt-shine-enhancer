import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Heart, Search, ShoppingBag, Trash2 } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import { formatMoney } from "@/lib/formatters";
import { useJudgeMeRatings } from "@/lib/judgeme";
import { useProducts } from "@/lib/shopify-data";
import { useWishlist } from "@/lib/wishlist";

function normalizeHandle(input: string | null | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^products\//i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

const WishlistPage = () => {
  const { items, itemCount, clear, removeItem } = useWishlist();
  const { data: productsPayload } = useProducts();

  const productsByHandle = useMemo(
    () =>
      new Map(
        (productsPayload?.products || []).map((product) => [normalizeHandle(product.handle), product]),
      ),
    [productsPayload],
  );

  const savedEntries = useMemo(
    () =>
      items.map((item) => ({
        item,
        product: productsByHandle.get(normalizeHandle(item.handle)) || null,
      })),
    [items, productsByHandle],
  );
  const savedProductIds = useMemo(
    () =>
      savedEntries
        .map((entry) => entry.product?.id)
        .filter((value): value is number => typeof value === "number"),
    [savedEntries],
  );
  const savedRatingsQuery = useJudgeMeRatings(savedProductIds);
  const savedRatingsById = savedRatingsQuery.data ?? {};

  const unresolvedCount = savedEntries.filter((entry) => !entry.product).length;

  if (!items.length) {
    return (
      <section className="mx-auto mt-8 w-[min(920px,calc(100%-20px))] pb-12 text-center sm:w-[min(920px,calc(100%-20px))]">
        <Reveal>
          <div className="salt-surface rounded-[2rem] p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Heart className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-4xl">Your wishlist is empty</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Save products you like so you can come back to them later without searching again.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/shop" className="salt-primary-cta h-11 px-6 text-sm font-bold">
                Start shopping
              </Link>
              <Link to="/collections" className="salt-outline-chip h-11 px-6 py-0 text-sm">
                Browse categories
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-5 w-[min(1280px,calc(100%-20px))] pb-10 sm:mt-6 sm:w-[min(1280px,calc(100%-20px))]">
      <Reveal>
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Wishlist</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Saved for later</h1>
            <p className="mt-2 text-sm text-muted-foreground">{itemCount} saved items across your SALT browsing session.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="salt-outline-chip text-[0.62rem]">Persistent on this device</span>
              <span className="salt-outline-chip text-[0.62rem]">Use remove to clear saved items</span>
              {unresolvedCount > 0 ? (
                <span className="salt-outline-chip text-[0.62rem]">{unresolvedCount} saved item{unresolvedCount === 1 ? "" : "s"} may need a catalog refresh</span>
              ) : null}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link to="/shop" className="salt-outline-chip h-11 justify-center px-5 py-0 text-sm">
              Continue shopping
            </Link>
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              Clear wishlist
            </button>
          </div>
        </div>
      </Reveal>

      <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
          {savedEntries.map(({ item, product }, index) => (
            <Reveal key={`${item.handle}-${item.id}`} delayMs={index * 45} className="h-full">
              {product ? (
                <div className="flex h-full flex-col gap-2">
                  <ProductCard
                    product={product}
                    variant="shop"
                    reviewSummary={savedRatingsById[product.id] ?? null}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.handle)}
                    className="inline-flex h-10 items-center justify-center rounded-[0.95rem] border border-border/75 bg-card px-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <article className="salt-story-card flex h-full flex-col overflow-hidden rounded-[1.65rem] border border-border/75">
                  <div className="relative aspect-[4/4.8] overflow-hidden bg-muted">
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.32),transparent_48%),radial-gradient(circle_at_72%_78%,hsl(var(--salt-blue)/0.28),transparent_44%),hsl(var(--muted))] text-primary-foreground">
                        <Heart className="h-8 w-8 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-[1.2rem] leading-[1.08] text-foreground">{item.title}</h2>
                      <button
                        type="button"
                        onClick={() => removeItem(item.handle)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/75 bg-card text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        aria-label={`Remove ${item.title} from wishlist`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.productType || "Saved SALT product"}
                    </p>

                    <strong className="font-display text-[1.55rem] leading-none text-foreground">
                      {formatMoney(item.unitPrice)}
                    </strong>

                    <div className="mt-auto grid gap-2">
                      <Link to={`/products/${item.handle}`} className="salt-primary-cta h-11 justify-center px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em]">
                        View details
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.handle)}
                        className="inline-flex h-11 items-center justify-center rounded-[1rem] border border-border/75 bg-card px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              )}
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal>
        <div className="salt-section-shell mt-8 rounded-[1.45rem] border border-border/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Next step</p>
              <h2 className="mt-1 font-display text-[1.8rem] leading-[1.02]">Keep exploring SALT</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Return to the catalog, open a saved item, or search the store when you are ready to buy.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:w-auto sm:flex-row">
              <Link to="/shop" className="salt-primary-cta h-11 justify-center px-5 text-[0.72rem] font-semibold uppercase tracking-[0.12em]">
                <Search className="h-4 w-4" />
                Shop all
              </Link>
              <Link to="/cart" className="salt-outline-chip h-11 justify-center px-5 py-0 text-[0.72rem] font-semibold uppercase tracking-[0.12em]">
                <ShoppingBag className="h-4 w-4" />
                View cart
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default WishlistPage;
