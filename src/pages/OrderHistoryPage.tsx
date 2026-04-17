import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardList, History, RotateCcw, Search, Trash2 } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/formatters";
import { trackMetaPixelInitiateCheckout } from "@/lib/meta-pixel";
import { useDeviceOrderHistory } from "@/lib/order-history";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OrderHistoryPage = () => {
  const { entries, purchasesLast30Days, clear, remove } = useDeviceOrderHistory();
  const { replaceItems } = useCart();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "cart" | "buy-now">("all");

  const totalSpent = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.subtotal, 0),
    [entries],
  );
  const averageOrderValue = entries.length > 0 ? totalSpent / entries.length : 0;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (sourceFilter !== "all" && entry.source !== sourceFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return entry.items.some((item) =>
          `${item.title} ${item.handle}`.toLowerCase().includes(normalizedQuery),
        );
      }),
    [entries, normalizedQuery, sourceFilter],
  );

  const filteredItemCount = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.itemCount, 0),
    [filteredEntries],
  );

  if (!entries.length) {
    return (
      <section className="mx-auto mt-8 w-[min(880px,calc(100%-20px))] pb-10 text-center">
        <Reveal>
          <div className="salt-surface rounded-[2rem] p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <History className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-4xl">No orders tracked yet</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Once checkout starts, your recent order timeline appears here on this device.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/shop" className="salt-primary-cta h-11 px-6 text-sm font-bold">
                Shop products
              </Link>
              <Link to="/cart" className="salt-outline-chip h-11 px-6 py-0 text-sm">
                Open cart
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-6 w-[min(1200px,calc(100%-20px))] pb-12">
      <Reveal>
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Order history</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">
              Your recent order timeline
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {purchasesLast30Days.toLocaleString()} items recorded on this device in the last 30 days.
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-destructive/40 hover:text-destructive sm:w-auto"
          >
            Clear history
          </button>
        </div>
      </Reveal>

      <Reveal>
        <div className="salt-panel-shell mb-4 rounded-2xl p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Orders on this device</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{entries.length.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Items in last 30 days</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{purchasesLast30Days.toLocaleString()}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Spend on this device</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(totalSpent)}</p>
            </div>
            <div className="salt-ambient-card rounded-xl px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Average order value</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(averageOrderValue)}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Search products in order history"
                className="salt-form-control h-10 w-full rounded-full border-border/85 bg-background/92 pl-9 pr-3"
              />
            </label>
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={`salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs lg:w-auto ${sourceFilter === "all" ? "border-primary/50 text-primary" : ""}`}
            >
              All sources
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("cart")}
              className={`salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs lg:w-auto ${sourceFilter === "cart" ? "border-primary/50 text-primary" : ""}`}
            >
              Cart checkout
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("buy-now")}
              className={`salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs lg:w-auto ${sourceFilter === "buy-now" ? "border-primary/50 text-primary" : ""}`}
            >
              Buy now
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filteredEntries.length.toLocaleString()} order(s) and {filteredItemCount.toLocaleString()} item(s)
            {sourceFilter !== "all" ? ` | ${sourceFilter === "buy-now" ? "Buy now only" : "Cart checkout only"}` : ""}
            {normalizedQuery ? ` | matching "${query.trim()}"` : ""}
          </p>
        </div>
      </Reveal>

      {filteredEntries.length === 0 ? (
        <Reveal>
          <div className="salt-surface rounded-2xl p-7 text-center">
            <p className="text-lg font-semibold">No matching orders found</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different keyword or switch the source filter.
            </p>
          </div>
        </Reveal>
      ) : null}

      <div className="grid gap-3">
        {filteredEntries.map((entry, index) => (
          <Reveal key={entry.id} delayMs={index * 45}>
            <article className="salt-panel-shell rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-primary">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {entry.source === "buy-now" ? "Direct checkout flow" : "Cart checkout flow"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{formatTimestamp(entry.createdAt)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {entry.itemCount} item(s) | {formatMoney(entry.subtotal)}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => replaceItems(entry.items)}
                    className="salt-outline-chip h-10 w-full justify-center px-4 py-0 text-xs sm:w-auto"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Re-add to cart
                  </button>
                  <a
                    href={entry.checkoutUrl}
                    onClick={() => trackMetaPixelInitiateCheckout(entry.items)}
                    className="salt-primary-cta h-10 w-full px-4 text-xs font-bold sm:w-auto"
                  >
                    Checkout again <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border hover:border-destructive/40 hover:text-destructive sm:w-10"
                    aria-label="Remove history entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entry.items.slice(0, 6).map((item) => (
                  <div
                    key={`${entry.id}-${item.id}-${item.handle}`}
                    className="flex items-center gap-2 rounded-xl border border-border/75 bg-background/85 p-2.5"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-12 w-12 rounded-lg border border-border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-muted text-[0.6rem] font-bold uppercase text-muted-foreground">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty {item.quantity} | {formatMoney(item.unitPrice)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default OrderHistoryPage;
