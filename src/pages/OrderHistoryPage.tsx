import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  ExternalLink,
  Mail,
  Package2,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  LogIn,
  LogOut,
  ReceiptText,
} from "lucide-react";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import Reveal from "@/components/storefront/Reveal";
import {
  clearShopifyCustomerAccountSession,
  getShopifyCustomerAccountSessionHint,
  hasShopifyCustomerAccountClientId,
  loadShopifyCustomerOrders,
  prepareShopifyCustomerAccountSignIn,
} from "@/lib/shopify-customer-account";
import type {
  ShopifyCustomerAccountOrder,
  ShopifyCustomerAccountSummary,
} from "@/lib/shopify-customer-account-core";
import { buildShopLoginUrl } from "@/lib/theme-assets";

type PageMode = "loading" | "signed_out" | "ready" | "error";
type OrderFilter = "all" | "open" | "fulfilled" | "needs-attention";

type StatusTone = "emerald" | "amber" | "sky" | "rose" | "slate";

const ORDER_FILTERS: Array<{ value: OrderFilter; label: string }> = [
  { value: "all", label: "All orders" },
  { value: "open", label: "Open" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "needs-attention", label: "Needs attention" },
];

function formatDateTime(value: string): string {
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

function formatCurrency(amount: number, currencyCode: string): string {
  const numeric = Number.isFinite(amount) ? amount : 0;
  const currency = String(currencyCode || "USD").trim().toUpperCase() || "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

function getOrderItemCount(order: ShopifyCustomerAccountOrder): number {
  return order.lineItems.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isOpenOrder(order: ShopifyCustomerAccountOrder): boolean {
  const fulfillment = order.fulfillmentStatus.toLowerCase();
  const payment = order.paymentStatus.toLowerCase();

  if (["fulfilled", "restocked"].includes(fulfillment)) {
    return false;
  }

  if (["refunded", "voided"].includes(payment)) {
    return false;
  }

  return true;
}

function getOrderTone(order: ShopifyCustomerAccountOrder): StatusTone {
  const fulfillment = order.fulfillmentStatus.toLowerCase();
  const payment = order.paymentStatus.toLowerCase();

  if (payment === "refunded" || payment === "voided") {
    return "rose";
  }

  if (fulfillment === "fulfilled") {
    return "emerald";
  }

  if (fulfillment === "in progress" || fulfillment === "pending fulfillment") {
    return "sky";
  }

  if (fulfillment === "on hold" || payment === "pending" || payment === "authorized") {
    return "amber";
  }

  return "slate";
}

function getOrderToneClasses(tone: StatusTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "amber":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "sky":
      return "border-primary/20 bg-primary/10 text-primary dark:text-primary";
    case "rose":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border/70 bg-background/90 text-muted-foreground";
  }
}

function getOrderStateLabel(order: ShopifyCustomerAccountOrder): string {
  if (order.paymentStatus === "Refunded" || order.paymentStatus === "Voided") {
    return order.paymentStatus;
  }

  if (order.fulfillmentStatus === "Fulfilled") {
    return "Fulfilled";
  }

  if (order.fulfillmentStatus === "In progress") {
    return "In progress";
  }

  if (order.fulfillmentStatus === "Pending fulfillment") {
    return "Pending fulfillment";
  }

  if (order.fulfillmentStatus === "On hold") {
    return "On hold";
  }

  if (order.paymentStatus === "Pending" || order.paymentStatus === "Authorized") {
    return order.paymentStatus;
  }

  return order.fulfillmentStatus || order.paymentStatus || "Open";
}

function getOrderSearchBlob(order: ShopifyCustomerAccountOrder): string {
  return normalizeText(
    [
      order.name,
      order.confirmationNumber,
      order.paymentStatus,
      order.fulfillmentStatus,
      order.statusPageUrl,
      order.phone,
      ...order.lineItems.map((item) => `${item.title} ${item.variantTitle}`),
    ].join(" "),
  );
}

function classifyLoadError(message: string): "missing_session" | "config" | "network" {
  const normalized = message.toLowerCase();

  if (normalized.includes("session is missing")) {
    return "missing_session";
  }

  if (
    normalized.includes("missing shopify customer account client id") ||
    normalized.includes("unable to discover shopify customer account endpoints") ||
    normalized.includes("unable to resolve shopify customer account token endpoint")
  ) {
    return "config";
  }

  return "network";
}

const ShopifyOrderBadge = ({ label, tone }: { label: string; tone: StatusTone }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${getOrderToneClasses(tone)}`}
  >
    {label}
  </span>
);

const OrderHistoryPage = () => {
  const sessionHint = getShopifyCustomerAccountSessionHint();
  const hasCustomerAccountClientId = hasShopifyCustomerAccountClientId();
  const [account, setAccount] = useState<ShopifyCustomerAccountSummary | null>(null);
  const [mode, setMode] = useState<PageMode>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [loginHint, setLoginHint] = useState(sessionHint?.loginHint ?? "");

  const orders = account?.orders ?? [];
  const currencyCode = orders[0]?.currencyCode ?? "USD";

  const orderStats = useMemo(() => {
    let totalSpent = 0;
    let openOrderCount = 0;
    let fulfilledOrderCount = 0;
    let needsAttentionCount = 0;

    for (const order of orders) {
      totalSpent += order.totalAmount;

      if (isOpenOrder(order)) {
        openOrderCount += 1;
      }

      if (order.fulfillmentStatus === "Fulfilled") {
        fulfilledOrderCount += 1;
      }

      if (
        order.paymentStatus === "Refunded" ||
        order.paymentStatus === "Voided" ||
        order.fulfillmentStatus === "On hold"
      ) {
        needsAttentionCount += 1;
      }
    }

    return {
      totalSpent,
      openOrderCount,
      fulfilledOrderCount,
      needsAttentionCount,
    };
  }, [orders]);
  const { totalSpent, openOrderCount, fulfilledOrderCount, needsAttentionCount } = orderStats;
  const recentOrder = orders[0] ?? null;
  const customer = account?.customer ?? null;
  const normalizedSearch = normalizeText(search);
  const recentOrderItemCount = recentOrder ? getOrderItemCount(recentOrder) : 0;
  const seoMetadata = (
    <SeoMetadata
      title="Account Orders | SALT Online Store"
      description="Sign in to view Shopify order history, fulfillment updates, and account access."
      canonicalPath="/account/orders"
      noIndex
    />
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filter === "open" && !isOpenOrder(order)) {
        return false;
      }

      if (filter === "fulfilled" && order.fulfillmentStatus !== "Fulfilled") {
        return false;
      }

      if (filter === "needs-attention") {
        const needsAttention =
          order.paymentStatus === "Refunded" ||
          order.paymentStatus === "Voided" ||
          order.fulfillmentStatus === "On hold";
        if (!needsAttention) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      return getOrderSearchBlob(order).includes(normalizedSearch);
    });
  }, [filter, normalizedSearch, orders]);

  const refreshOrders = async (): Promise<void> => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const summary = await loadShopifyCustomerOrders();
      setAccount(summary);
      setMode("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load Shopify orders";
      const kind = classifyLoadError(message);

      if (kind === "missing_session") {
        setAccount(null);
        setMode("signed_out");
        return;
      }

      setAccount(null);
      setMode("error");
      setLoadError(message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!active) {
        return;
      }

      await refreshOrders();
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const value = loginHint.trim();

    if (!value) {
      setSignInError("Enter the email address or mobile number tied to your Shopify account.");
      return;
    }

    if (!hasCustomerAccountClientId) {
      window.location.assign(buildShopLoginUrl());
      return;
    }

    setSigningIn(true);
    setSignInError(null);

    try {
      const { authorizationUrl } = await prepareShopifyCustomerAccountSignIn({
        email: value,
        returnTo: "/account/orders",
      });

      window.location.assign(authorizationUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Shopify sign-in";
      if (message.toLowerCase().includes("missing shopify customer account client id")) {
        window.location.assign(buildShopLoginUrl());
        return;
      }

      setSignInError(message);
      setSigningIn(false);
    }
  };

  const handleSignOut = (): void => {
    clearShopifyCustomerAccountSession();
    setAccount(null);
    setLoadError(null);
    setSignInError(null);
    setMode("signed_out");
    setSearch("");
    setFilter("all");
  };

  const heroSummaryCards = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-border/70 bg-background/88 p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.42)]">
        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Orders</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{orders.length.toLocaleString()}</p>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/88 p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.42)]">
        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Open</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{openOrderCount.toLocaleString()}</p>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/88 p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.42)]">
        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Fulfilled</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{fulfilledOrderCount.toLocaleString()}</p>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/88 p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.42)]">
        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Spent</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalSpent, currencyCode)}</p>
      </div>
    </div>
  );

  const signInPanel = (
    <div className="grid gap-4 rounded-[1.8rem] border border-border/70 bg-background/94 p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.5)] lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
      <div className="rounded-[1.45rem] border border-primary/15 bg-[linear-gradient(180deg,rgba(29,96,216,0.08),rgba(29,96,216,0.03))] p-4 sm:p-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Shopify customer accounts
        </div>
        <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,2.8rem)] leading-[0.94]">
          Sign in with the email or mobile tied to your Shopify account.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {hasCustomerAccountClientId
            ? "Orders are pulled directly from Shopify with payment and fulfillment status labels from the customer account API. No device-only history, no local shadow copy."
            : "This environment will hand customers off to Shopify hosted sign-in because the Customer Account API client ID is not configured here. No device-only history, no local shadow copy."}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-background/88 p-3">
            <Mail className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">Email login</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Use the address linked to your customer profile.</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/88 p-3">
            <Smartphone className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">Mobile login</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Mobile numbers work when Shopify has them on file.</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/88 p-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">Shopify backed</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Statuses and totals come from the live customer account API.</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSignIn}
        className="rounded-[1.45rem] border border-border/70 bg-card/92 p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.52)] sm:p-5"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Continue to orders</p>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-foreground">Email or mobile number</span>
          <input
            value={loginHint}
            onChange={(event) => setLoginHint(event.target.value)}
            type="text"
            inputMode="text"
            autoComplete="username"
            placeholder="asha@example.com or +1 317 555 0198"
            className="salt-form-control h-12 w-full rounded-2xl border-border/80 bg-background/94 px-4 text-sm"
          />
        </label>

        {signInError ? (
          <div className="mt-3 rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {signInError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={signingIn}
          className="salt-primary-cta mt-4 h-12 w-full justify-center rounded-2xl px-5 text-sm font-bold"
        >
          {signingIn ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Connecting to Shopify
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Sign in and load orders
            </>
          )}
        </button>

        <div className="mt-4 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What happens next</p>
          <ul className="mt-2 grid gap-2 text-sm leading-6">
            <li className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Shopify authenticates the customer account in its own flow.
            </li>
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              The app returns here and pulls live orders with statuses.
            </li>
            <li className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Recent orders and fulfillment states stay synchronized with Shopify.
            </li>
          </ul>
          {!hasCustomerAccountClientId ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Hosted login fallback is active because the Customer Account API client ID is not configured in this
              environment.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );

  const loadStateBanner = (
    <div className="rounded-[1.5rem] border border-border/70 bg-background/92 p-4 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Order tracking</p>
          <h1 className="mt-2 font-display text-[clamp(2rem,4.5vw,3.8rem)] leading-[0.92]">
            Shopify orders, statuses, and account access in one place.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            This page talks to the Shopify Customer Account API so your customers can sign in with email or mobile
            and see the same order states Shopify shows in account.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Package2 className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Live Shopify data
          </span>
          <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ReceiptText className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Proper order status
          </span>
          <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Customer account flow
          </span>
        </div>
      </div>
    </div>
  );

  if (mode === "loading" && !account) {
    return (
      <>
        {seoMetadata}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(29,96,216,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(244,184,0,0.12),transparent_28%),linear-gradient(180deg,rgba(248,250,255,1),rgba(244,248,255,0.94))]" />
          <div className="relative mx-auto w-[min(1280px,calc(100%_-_20px))] pb-12 pt-5 sm:pb-14 sm:pt-8">
            <Reveal>{loadStateBanner}</Reveal>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
              <Reveal delayMs={60}>
                <div className="salt-surface rounded-[1.8rem] border p-5 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)]">
                  <div className="h-5 w-44 animate-pulse rounded-full bg-muted/70" />
                  <div className="mt-4 h-10 w-4/5 animate-pulse rounded-2xl bg-muted/60" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-muted/60" />
                  <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-muted/50" />
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
                    <div className="h-24 animate-pulse rounded-2xl bg-muted/30" />
                  </div>
                </div>
              </Reveal>
              <Reveal delayMs={100}>
                <div className="salt-surface rounded-[1.8rem] border p-5 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)]">
                  <div className="h-5 w-32 animate-pulse rounded-full bg-muted/70" />
                  <div className="mt-4 h-11 w-full animate-pulse rounded-2xl bg-muted/50" />
                  <div className="mt-3 h-11 w-full animate-pulse rounded-2xl bg-muted/40" />
                  <div className="mt-3 h-11 w-full animate-pulse rounded-2xl bg-muted/40" />
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </>
    );
  }

  const content = mode === "signed_out" || mode === "error" ? signInPanel : null;
  const errorPanel =
    mode === "error" && loadError ? (
      <div className="rounded-[1.5rem] border border-rose-500/20 bg-rose-500/8 p-4 text-rose-700 dark:text-rose-200">
        <p className="font-semibold">Unable to load Shopify orders</p>
        <p className="mt-1 text-sm leading-6">{loadError}</p>
        <button
          type="button"
          onClick={() => void refreshOrders()}
          className="salt-outline-chip mt-4 h-10 px-4 text-xs font-bold uppercase tracking-[0.12em]"
        >
          Try again
        </button>
      </div>
    ) : null;

  return (
    <>
      {seoMetadata}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(29,96,216,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(244,184,0,0.12),transparent_28%),linear-gradient(180deg,rgba(248,250,255,1),rgba(244,248,255,0.94))]" />

        <div className="relative mx-auto w-[min(1280px,calc(100%_-_20px))] pb-12 pt-5 sm:pb-14 sm:pt-8">
          <Reveal>{loadStateBanner}</Reveal>

          <div className="mt-5 grid gap-5">
            <Reveal delayMs={70}>
              <div className="salt-surface rounded-[1.8rem] border p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)] sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your account</p>
                    <h2 className="mt-2 font-display text-[clamp(1.8rem,3.6vw,3rem)] leading-[0.94]">
                      {customer ? customer.displayName : "Connect your Shopify account"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {customer
                        ? "This dashboard pulls the latest Shopify orders, payment state, fulfillment state, and line items."
                        : "Once you sign in, this dashboard will pull the latest Shopify orders, payment state, fulfillment state, and line items."}
                    </p>
                  </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshOrders()}
                    disabled={refreshing}
                    className="salt-outline-chip h-10 px-4 text-xs font-bold uppercase tracking-[0.12em]"
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  {account ? (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-xs font-bold uppercase tracking-[0.12em] text-foreground transition hover:border-destructive/40 hover:text-destructive"
                    >
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                      Sign out
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/88 p-4">
                  <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Contact</p>
                  <div className="mt-2 grid gap-1 text-sm text-foreground">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4 text-primary" />
                      {customer?.email || sessionHint?.loginHint || "Not signed in"}
                    </span>
                    {customer?.phone ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Smartphone className="h-4 w-4 text-primary" />
                        {customer.phone}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/88 p-4">
                  <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Latest status</p>
                  <div className="mt-2 flex items-center gap-2">
                    {recentOrder ? (
                      <ShopifyOrderBadge
                        label={getOrderStateLabel(recentOrder)}
                        tone={getOrderTone(recentOrder)}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">No orders loaded</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {recentOrder ? `Last updated ${formatDateTime(recentOrder.updatedAt || recentOrder.processedAt)}` : "Connect to load live status."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/88 p-4">
                  <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Totals</p>
                  <div className="mt-2 text-sm text-foreground">
                    <p className="inline-flex items-center gap-2 font-medium">
                      <ReceiptText className="h-4 w-4 text-primary" />
                      {orders.length.toLocaleString()} Shopify order{orders.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      {formatCurrency(totalSpent, currencyCode)} across {recentOrderItemCount.toLocaleString()} item{recentOrderItemCount === 1 ? "" : "s"} is shown in this view.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {content ? (
            <Reveal delayMs={110}>{content}</Reveal>
          ) : null}

          {errorPanel ? <Reveal delayMs={110}>{errorPanel}</Reveal> : null}

          {mode === "ready" ? (
            <>
              <Reveal delayMs={110}>{heroSummaryCards}</Reveal>

              <Reveal delayMs={150}>
                <div className="salt-panel-shell rounded-[1.6rem] border p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.44)] sm:p-5">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        type="search"
                        placeholder="Search order number, item, status, or tracking URL"
                        className="salt-form-control h-12 w-full rounded-2xl border-border/80 bg-background/92 pl-11 pr-4 text-sm"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {ORDER_FILTERS.map((entry) => {
                        const active = filter === entry.value;
                        return (
                          <button
                            key={entry.value}
                            type="button"
                            onClick={() => setFilter(entry.value)}
                            className={`salt-outline-chip h-12 justify-center px-4 text-xs font-bold uppercase tracking-[0.11em] ${
                              active ? "border-primary/50 text-primary" : ""
                            }`}
                          >
                            {entry.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Showing {filteredOrders.length.toLocaleString()} order{filteredOrders.length === 1 ? "" : "s"}
                    {normalizedSearch ? ` matching "${search.trim()}"` : ""}
                    {filter !== "all" ? ` · ${ORDER_FILTERS.find((entry) => entry.value === filter)?.label}` : ""}
                  </p>
                </div>
              </Reveal>

              {filteredOrders.length === 0 ? (
                <Reveal delayMs={180}>
                  <div className="salt-surface rounded-[1.8rem] border p-8 text-center shadow-[0_24px_60px_-48px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-foreground">
                      {orders.length === 0 ? "No Shopify orders were returned yet" : "No orders matched your filters"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {orders.length === 0
                        ? "If this account has orders, they will appear here once Shopify returns them."
                        : "Adjust the search or switch the status filter to find the order you need."}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      <Link to="/shop" className="salt-primary-cta h-11 px-5 text-sm font-bold">
                        Continue shopping
                      </Link>
                      <button
                        type="button"
                        onClick={() => void refreshOrders()}
                        className="salt-outline-chip h-11 px-5 text-sm font-bold"
                      >
                        Refresh orders
                      </button>
                    </div>
                  </div>
                </Reveal>
              ) : null}

              <div className="grid gap-4">
                {filteredOrders.map((order, index) => {
                  const tone = getOrderTone(order);
                  const itemCount = getOrderItemCount(order);
                  const extraItems = Math.max(0, order.lineItems.length - 3);

                  return (
                    <Reveal key={order.id} delayMs={index * 45 + 190}>
                      <article className="salt-panel-shell rounded-[1.8rem] border p-4 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.45)] sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <ShopifyOrderBadge label={getOrderStateLabel(order)} tone={tone} />
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {order.paymentStatus}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {order.fulfillmentStatus}
                              </span>
                            </div>

                            <h3 className="mt-3 font-display text-2xl leading-tight text-foreground sm:text-[2rem]">
                              {order.name}
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Placed {formatDateTime(order.processedAt)} · {itemCount} item{itemCount === 1 ? "" : "s"}
                            </p>
                          </div>

                          <div className="flex flex-col items-start gap-3 rounded-[1.4rem] border border-border/70 bg-background/90 p-4 sm:min-w-[16rem]">
                            <div>
                              <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">Order total</p>
                              <p className="mt-1 text-2xl font-semibold text-foreground">{order.totalLabel}</p>
                            </div>
                            {order.statusPageUrl ? (
                              <a
                                href={order.statusPageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="salt-primary-cta h-11 w-full justify-center px-4 text-sm font-bold"
                              >
                                View Shopify status <ExternalLink className="ml-1.5 h-4 w-4" />
                              </a>
                            ) : null}
                            <Link
                              to="/shop"
                              className="salt-outline-chip h-11 w-full justify-center px-4 text-sm font-bold"
                            >
                              Continue shopping <ArrowRight className="ml-1.5 h-4 w-4" />
                            </Link>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {order.lineItems.slice(0, 3).map((item, itemIndex) => (
                            <div
                              key={`${order.id}-${itemIndex}-${item.title}`}
                              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/90 p-3"
                            >
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.imageAlt || item.title}
                                  className="h-14 w-14 rounded-xl border border-border object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="grid h-14 w-14 place-items-center rounded-xl border border-border bg-muted text-[0.62rem] font-bold uppercase text-muted-foreground">
                                  No image
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="line-clamp-1 text-sm font-semibold text-foreground">{item.title}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Qty {item.quantity}
                                  {item.variantTitle ? ` · ${item.variantTitle}` : ""}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-foreground">{item.totalLabel}</p>
                              </div>
                            </div>
                          ))}

                          {extraItems > 0 ? (
                            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-muted/25 p-3 text-center text-sm text-muted-foreground">
                              +{extraItems} more line item{extraItems === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </>
          ) : null}
          </div>
        </div>
      </section>
    </>
  );
};

export default OrderHistoryPage;
