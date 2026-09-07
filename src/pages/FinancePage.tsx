import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Database,
  Download,
  FileText,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { FinanceException, FinanceOrderRow, FinancePnlRow, FinanceSourceState, FinanceSummary } from "@/lib/finance-types";

type AuthState = "checking" | "locked" | "authenticated" | "unavailable";

function financeApi(path: string): string {
  if (typeof window === "undefined") return path;
  const origin = String(window.SALT_FINANCE_API_ORIGIN || "").trim().replace(/\/+$/, "");
  return `${origin}${path}`;
}

function financeAuthHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: string): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatTimestamp(value: string): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function sourceLabel(state: FinanceSourceState): string {
  return {
    connected: "Connected",
    partial: "Partial",
    missing: "Missing",
    unavailable: "Unavailable",
  }[state];
}

function sourceTone(state: FinanceSourceState): string {
  if (state === "connected") return "border-emerald-200/80 bg-emerald-50/80 text-emerald-800";
  if (state === "partial") return "border-amber-200/80 bg-amber-50/80 text-amber-800";
  return "border-rose-200/80 bg-rose-50/80 text-rose-800";
}

function StatCard({ label, value, detail, accent = "blue", icon }: { label: string; value: string; detail: string; accent?: "blue" | "green" | "gold" | "navy"; icon: ReactNode }) {
  const accentClasses = {
    blue: "from-blue-500/12 to-transparent text-blue-700",
    green: "from-emerald-500/12 to-transparent text-emerald-700",
    gold: "from-amber-400/18 to-transparent text-amber-700",
    navy: "from-slate-500/12 to-transparent text-slate-700",
  }[accent];

  return (
    <article className={`relative overflow-hidden rounded-[1.45rem] border border-border/75 bg-card/80 p-5 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.32)]`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentClasses}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-[clamp(1.75rem,3vw,2.45rem)] leading-none tracking-[-0.05em] text-foreground">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-2xl border border-border/75 bg-background/75 p-2.5 text-primary">{icon}</div>
      </div>
    </article>
  );
}

function PnlRow({ row, currency }: { row: FinancePnlRow; currency: string }) {
  const isNegative = row.cents < 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border/55 py-3 last:border-0">
      <div>
        <p className={`text-sm font-semibold ${row.label === "Operating profit" ? "text-foreground" : "text-foreground/90"}`}>{row.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.detail}</p>
      </div>
      <p className={`whitespace-nowrap text-sm font-bold ${isNegative ? "text-rose-700" : row.tone === "positive" ? "text-emerald-700" : "text-foreground"}`}>
        {formatMoney(row.cents, currency)}
      </p>
    </div>
  );
}

function SourceBadge({ label, state }: { label: string; state: FinanceSourceState }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/55 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${state === "connected" ? "bg-emerald-500" : state === "partial" ? "bg-amber-500" : "bg-rose-500"}`} />
        <span className="truncate text-sm font-semibold text-foreground">{label}</span>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] ${sourceTone(state)}`}>{sourceLabel(state)}</span>
    </div>
  );
}

function ReconciliationMetric({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold text-foreground">{formatMoney(cents, currency)}</p>
    </div>
  );
}

function ExceptionRow({ item }: { item: FinanceException }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-200/75 bg-amber-50/55 p-3">
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === "high" ? "text-rose-600" : "text-amber-600"}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{item.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.count} {item.kind === "missing-cost" ? `item${item.count === 1 ? "" : "s"}` : `record${item.count === 1 ? "" : "s"}`} flagged | {item.kind}</p>
      </div>
    </div>
  );
}

function ProfitabilityRow({ order, currency }: { order: FinanceOrderRow; currency: string }) {
  return (
    <div className="grid min-w-[700px] grid-cols-[1.15fr_0.75fr_0.75fr_0.75fr_0.85fr] gap-4 border-b border-border/55 px-4 py-3 text-sm last:border-0">
      <div>
        <p className="font-semibold text-foreground">{order.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.createdAt)} | {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
      </div>
      <p className="text-right text-muted-foreground">{formatMoney(order.netRevenueCents, currency)}</p>
      <p className="text-right text-muted-foreground">{formatMoney(order.cogsCents, currency)}</p>
      <p className="text-right text-muted-foreground">{formatMoney(order.allocatedFeesCents, currency)}</p>
      <div className="text-right">
        <p className={`font-bold ${order.profitCents >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatMoney(order.profitCents, currency)}</p>
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{order.marginPercent == null ? "n/a" : `${order.marginPercent}%`} | {order.costCoverage}</p>
      </div>
    </div>
  );
}

const FinancePage = () => {
  const defaultPeriod = useMemo(getDefaultPeriod, []);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [sessionToken, setSessionToken] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadSummary = useCallback(async () => {
    setIsRefreshing(true);
    setError("");
    try {
      const params = new URLSearchParams(period);
      const response = await fetch(financeApi(`/api/finance/summary?${params.toString()}`), { headers: financeAuthHeaders(sessionToken), credentials: "include", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSessionToken("");
        setAuthState("locked");
        setSummary(null);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Finance summary unavailable");
      setSummary(payload as FinanceSummary);
      setAuthState("authenticated");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Finance summary unavailable");
    } finally {
      setIsRefreshing(false);
    }
  }, [period, sessionToken]);

  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.getAttribute("content");
    let robotsTag = existingRobots;
    let createdRobots = false;
    if (!robotsTag) {
      robotsTag = document.createElement("meta");
      robotsTag.setAttribute("name", "robots");
      document.head.appendChild(robotsTag);
      createdRobots = true;
    }
    document.title = "SALT Finance | Private Operations";
    robotsTag.setAttribute("content", "noindex,follow");
    return () => {
      document.title = previousTitle;
      if (createdRobots) {
        robotsTag?.remove();
      } else if (robotsTag && previousRobots) {
        robotsTag.setAttribute("content", previousRobots);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(financeApi("/api/finance/session"), { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok && response.status !== 401) {
          setAuthState("unavailable");
          setAuthError(payload.error || "Finance authentication is unavailable");
          return;
        }
        if (payload.authenticated) {
          setAuthState("authenticated");
        } else {
          setAuthState("locked");
        }
      })
      .catch(() => {
        if (active) {
          setAuthState("unavailable");
          setAuthError("The finance API is not reachable from this deployment.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState === "authenticated") void loadSummary();
  }, [authState, loadSummary]);

  useEffect(() => {
    if (authState !== "authenticated") return;
    const interval = window.setInterval(() => void loadSummary(), 30_000);
    return () => window.clearInterval(interval);
  }, [authState, loadSummary]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    try {
      const response = await fetch(financeApi("/api/finance/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to authenticate");
      if (typeof payload.token !== "string" || !payload.token) throw new Error("Finance session could not be established");
      setSessionToken(payload.token);
      setPassword("");
      setAuthState("authenticated");
    } catch (loginError) {
      setAuthError(loginError instanceof Error ? loginError.message : "Unable to authenticate");
    }
  }

  async function handleLogout() {
    await fetch(financeApi("/api/finance/logout"), { method: "POST", headers: financeAuthHeaders(sessionToken), credentials: "include" });
    setSessionToken("");
    setSummary(null);
    setAuthState("locked");
  }

  async function handleExport() {
    setIsExporting(true);
    setError("");
    try {
      const params = new URLSearchParams(period);
      const response = await fetch(financeApi(`/api/finance/export?${params.toString()}`), { headers: financeAuthHeaders(sessionToken), credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to export PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `salt-finance-${period.start}-to-${period.end}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export PDF");
    } finally {
      setIsExporting(false);
    }
  }

  if (authState === "checking") {
    return <FinanceLoading />;
  }

  if (authState === "unavailable") {
    return <FinanceAccessCard error={authError || "Finance authentication is unavailable."} />;
  }

  if (authState === "locked") {
    return <FinanceLogin password={password} setPassword={setPassword} error={authError} onSubmit={handleLogin} />;
  }

  const kpis = summary?.kpis;
  const currency = summary?.currency || "USD";
  const payoutsNeedApproval = summary?.sources.payouts === "partial" || summary?.sources.payouts === "unavailable";
  const payoutsNotice =
    summary?.sources.payouts === "partial"
      ? "Shopify payout access is limited until merchant-approved Payments API access is granted."
      : summary?.sources.payouts === "unavailable"
        ? "Shopify payout data is unavailable. The page will retry automatically when access is restored."
        : "";
  const missingCostException = summary?.exceptions.find((item) => item.kind === "missing-cost");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_8%_0%,hsl(var(--primary)/0.12),transparent_28%),radial-gradient(circle_at_92%_8%,hsl(var(--salt-gold)/0.13),transparent_24%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--salt-warm-bg)/0.84))] px-3 py-4 text-foreground sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="rounded-[2rem] border border-border/80 bg-card/80 p-4 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="salt-kicker">Private operations</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" /> Protected</span>
              </div>
              <h1 className="mt-4 max-w-2xl font-display text-[clamp(2.5rem,6vw,5.6rem)] leading-[0.88] tracking-[-0.07em] text-foreground">Profit with a clearer next move.</h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">A single operating view for revenue, real payouts, DSers product cost, campaign cost per order, subscriptions, and the exceptions that need attention.</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-[25rem] lg:justify-end">
              <button type="button" onClick={() => void loadSummary()} disabled={isRefreshing} className="salt-outline-chip h-11 gap-2 px-4 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh</button>
              <button type="button" onClick={() => void handleExport()} disabled={isExporting} className="salt-primary-cta h-11 gap-2 px-4 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-60"><Download className="h-4 w-4" /> {isExporting ? "Preparing" : "Export PDF"}</button>
              <button type="button" onClick={() => void handleLogout()} className="salt-outline-chip h-11 gap-2 px-4 text-xs font-bold uppercase tracking-[0.1em]"><LogOut className="h-4 w-4" /> Lock</button>
            </div>
          </div>

          <div className="mt-7 grid gap-3 border-t border-border/65 pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> From</span><input type="date" value={period.start} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground" /></label>
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> To</span><input type="date" value={period.end} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground" /></label>
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/55 px-3 py-2.5 text-xs text-muted-foreground sm:h-11"><Database className="h-4 w-4 text-primary" /><span>{summary ? `Live · ${formatTimestamp(summary.generatedAt)}` : "Waiting for data"}</span></div>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-2xl border border-rose-200/80 bg-rose-50/75 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

        {summary ? (
          <>
            {payoutsNeedApproval ? (
              <div className="mt-5 rounded-[1.5rem] border border-amber-200/80 bg-amber-50/75 p-4 shadow-[0_18px_45px_-36px_rgba(180,83,9,0.35)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="mt-0.5 rounded-2xl border border-amber-200 bg-amber-100/80 p-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-amber-700">Payout access needs approval</p>
                      <h2 className="mt-1 text-lg font-semibold text-amber-950">Payments API access is not fully granted yet.</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900/90">{payoutsNotice}</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
                    Merchant approval required
                  </div>
                </div>
              </div>
            ) : null}

            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Operating profit (conservative)" value={formatMoney(kpis?.conservativeOperatingProfitCents || 0, currency)} detail={`realized ${formatMoney(kpis?.operatingProfitCents || 0, currency)} | ${kpis?.pendingChargebackCents ? `${formatMoney(kpis.pendingChargebackCents, currency)} under review included` : "no pending chargebacks"}`} accent={kpis?.conservativeOperatingProfitCents && kpis.conservativeOperatingProfitCents < 0 ? "gold" : "green"} icon={<CircleDollarSign className="h-5 w-5" />} />
              <StatCard label="Net sales" value={formatMoney(kpis?.netSalesCents || 0, currency)} detail={`${kpis?.orderCount || 0} orders | ${formatMoney(kpis?.returnDeductionsCents || 0, currency)} product returns removed`} icon={<ArrowUpRight className="h-5 w-5" />} />
              <StatCard label="Payouts received" value={formatMoney(kpis?.payoutsReceivedCents || 0, currency)} detail="Paid Shopify payout cash" accent="navy" icon={<WalletCards className="h-5 w-5" />} />
              <StatCard label="DSers product cost" value={formatMoney(kpis?.cogsCents || 0, currency)} detail={`${kpis?.costCoveragePercent == null ? "n/a" : `${kpis.costCoveragePercent}%`} cost coverage${missingCostException ? ` | ${missingCostException.count} item${missingCostException.count === 1 ? "" : "s"} missing` : ""}`} accent="gold" icon={<ArrowDownRight className="h-5 w-5" />} />
              <StatCard label="Subscriptions" value={formatMoney(kpis?.subscriptionCostsCents || 0, currency)} detail="Shopify Grow + DSers recurring costs" accent="navy" icon={<FileText className="h-5 w-5" />} />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
              <article className="rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="salt-kicker">P&L statement</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Where the money went.</h2></div><span className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">{summary.period.start} to {summary.period.end}</span></div>
                <div className="mt-5">{summary.pnlRows.map((row) => <PnlRow key={row.label} row={row} currency={currency} />)}</div>
              </article>
              <aside className="rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6"><p className="salt-kicker">Live data confidence</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Know what is real.</h2><div className="mt-4"><SourceBadge label="Shopify orders" state={summary.sources.shopify} /><SourceBadge label="Shopify payouts" state={summary.sources.payouts} /><SourceBadge label="DSers product cost" state={summary.sources.dsers} /><SourceBadge label="Campaign cost per order" state={summary.sources.campaigns} /><SourceBadge label="Grow + DSers billing" state={summary.sources.subscriptions} /><SourceBadge label="Live reconciliation" state={summary.sources.reconciliation} /></div><div className="mt-4 rounded-2xl border border-blue-200/70 bg-blue-50/55 p-3.5 text-xs leading-5 text-blue-900">{summary.sources.messages.map((message) => <p key={message} className="mt-2 first:mt-0">{message}</p>)}</div></aside>
            </section>

            <section className="mt-5 rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="salt-kicker">Live cash reconciliation</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Keep cash and accrual honest.</h2></div><span className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] ${sourceTone(summary.reconciliation.state)}`}>{sourceLabel(summary.reconciliation.state)}</span></div>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">Calculated from Shopify payout, order, product-cost, campaign, refund, chargeback, and app-billing responses for the selected period.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ReconciliationMetric label="Pending payout" cents={summary.reconciliation.totals.pendingPayoutCents} currency={currency} />
                <ReconciliationMetric label="Payout paid" cents={summary.reconciliation.totals.payoutPaidCents} currency={currency} />
                <ReconciliationMetric label="Order cost" cents={-summary.reconciliation.totals.orderCostCents} currency={currency} />
                <ReconciliationMetric label="Subscription cost" cents={-summary.reconciliation.totals.billCostCents} currency={currency} />
                <ReconciliationMetric label="Campaign cost" cents={-summary.reconciliation.totals.campaignCostCents} currency={currency} />
                <ReconciliationMetric label="Payment fees recorded" cents={-summary.reconciliation.totals.feeCents} currency={currency} />
                <ReconciliationMetric label="Live cash profit" cents={summary.reconciliation.totals.profitCents} currency={currency} />
                <ReconciliationMetric label="Accrual P&L vs live cash" cents={(kpis?.operatingProfitCents || 0) - summary.reconciliation.totals.profitCents} currency={currency} />
                <ReconciliationMetric label="Refunds in Shopify period" cents={-(kpis?.periodRefundsCents || 0)} currency={currency} />
                <ReconciliationMetric label="Cancelled refund cash" cents={-(kpis?.cancelledOrderRefundsCents || 0)} currency={currency} />
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200/70 bg-blue-50/55 p-3.5 text-xs leading-5 text-blue-900">
                <p>{summary.reconciliation.message || "Live reconciliation is not available yet."}</p>
                {(kpis?.cancelledOrderRefundsCents || 0) > 0 ? <p className="mt-2">{formatMoney(kpis?.cancelledOrderRefundsCents || 0, currency)} of the period refund events belong to cancelled orders and are shown here for review, but excluded from the accrual P&amp;L to avoid double counting cancelled revenue.</p> : null}
              </div>
            </section>

            <section className="mt-5 rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="salt-kicker">Reconciliation desk</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Exceptions before surprises.</h2></div><span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${summary.exceptions.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{summary.exceptions.length ? `${summary.exceptions.length} needs review` : "All clear"}</span></div><div className="mt-5 grid gap-3 md:grid-cols-2">{summary.exceptions.length ? summary.exceptions.map((item) => <ExceptionRow key={`${item.kind}-${item.message}`} item={item} />) : <div className="rounded-2xl border border-emerald-200/75 bg-emerald-50/55 p-4 text-sm text-emerald-900">No reconciliation exceptions were reported for this period.</div>}</div></section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
              <article className="rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="salt-kicker">Payout ledger</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">What actually arrived.</h2></div><WalletCards className="h-6 w-6 text-primary" /></div><div className="mt-5 overflow-x-auto">{summary.payouts.length ? <div className="min-w-[560px]"><div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr] gap-3 border-b border-border/75 px-3 pb-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"><span>Payout</span><span>Status</span><span className="text-right">Fees</span><span className="text-right">Net</span></div>{summary.payouts.map((payout) => <div key={payout.id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr] gap-3 border-b border-border/55 px-3 py-3 text-sm last:border-0"><div><p className="font-semibold">{payout.id}</p><p className="text-xs text-muted-foreground">{formatDate(payout.issuedAt)}</p></div><span className="self-start rounded-full bg-emerald-50 px-2 py-1 text-[0.62rem] font-bold uppercase text-emerald-800">{payout.status}</span><span className="text-right text-muted-foreground">{formatMoney(payout.feeCents, payout.currency)}</span><span className="text-right font-bold text-foreground">{formatMoney(payout.netCents, payout.currency)}</span></div>)}</div> : <p className="rounded-2xl border border-border/65 bg-background/50 p-4 text-sm text-muted-foreground">No payout records were returned for this period.</p>}</div></article>
              <article className="rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="salt-kicker">Recurring costs</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Subscriptions that matter.</h2></div><FileText className="h-6 w-6 text-primary" /></div><div className="mt-5">{summary.subscriptions.length ? summary.subscriptions.map((subscription) => <div key={`${subscription.name}-${subscription.interval}`} className="flex items-center justify-between gap-4 border-b border-border/55 py-3 last:border-0"><div><p className="text-sm font-semibold">{subscription.name}</p><p className="text-xs text-muted-foreground">{subscription.category} | {subscription.interval} | {subscription.source}</p></div><p className="whitespace-nowrap text-sm font-bold">{formatMoney(subscription.allocatedCents, subscription.currency)}</p></div>) : <p className="rounded-2xl border border-border/65 bg-background/50 p-4 text-sm text-muted-foreground">No subscription costs configured yet.</p>}</div></article>
            </section>

            <section className="mt-5 rounded-[1.7rem] border border-border/75 bg-card/80 p-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.35)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="salt-kicker">Order profitability</p><h2 className="mt-2 font-display text-3xl tracking-[-0.05em]">Find the margin leaks.</h2></div><span className="text-xs text-muted-foreground">Showing up to 200 orders</span></div><div className="mt-5 overflow-x-auto">{summary.orders.length ? <div className="min-w-[700px]"><div className="grid grid-cols-[1.15fr_0.75fr_0.75fr_0.75fr_0.85fr] gap-4 border-b border-border/75 px-4 pb-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"><span>Order</span><span className="text-right">Net revenue</span><span className="text-right">Cost</span><span className="text-right">Fees</span><span className="text-right">Profit</span></div>{summary.orders.map((order) => <ProfitabilityRow key={order.id} order={order} currency={currency} />)}</div> : <p className="rounded-2xl border border-border/65 bg-background/50 p-4 text-sm text-muted-foreground">No orders were returned for this period.</p>}</div></section>

            <footer className="flex flex-col gap-2 px-1 pb-4 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Protected SALT finance workspace · live Shopify data</span><span>Last refreshed {formatTimestamp(summary.generatedAt)} | {summary.period.timezone}</span></footer>
          </>
        ) : null}
      </div>
    </div>
  );
};

function FinanceLoading() {
  return <div className="grid min-h-screen place-items-center bg-background p-6"><div className="rounded-[1.7rem] border border-border/75 bg-card/80 px-8 py-10 text-center shadow-xl"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-4 font-display text-2xl tracking-[-0.04em]">Opening finance workspace</p><p className="mt-2 text-sm text-muted-foreground">Checking the private session.</p></div></div>;
}

function FinanceAccessCard({ error }: { error: string }) {
  return <div className="grid min-h-screen place-items-center bg-background p-4 sm:p-6"><div className="w-full max-w-lg rounded-[2rem] border border-border/75 bg-card/85 p-7 text-center shadow-[0_35px_80px_-48px_rgba(15,23,42,0.45)] sm:p-10"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700"><LockKeyhole className="h-6 w-6" /></div><p className="mt-5 salt-kicker justify-center">Private route</p><h1 className="mt-3 font-display text-4xl tracking-[-0.06em]">Finance access is unavailable.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{error}</p></div></div>;
}

function FinanceLogin({ password, setPassword, error, onSubmit }: { password: string; setPassword: (value: string) => void; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.14),transparent_32%),radial-gradient(circle_at_80%_90%,hsl(var(--salt-gold)/0.12),transparent_28%),hsl(var(--background))] p-4 sm:p-6"><div className="w-full max-w-xl rounded-[2rem] border border-border/75 bg-card/85 p-7 shadow-[0_35px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10"><div className="flex items-start justify-between gap-4"><div><p className="salt-kicker">Private operations</p><h1 className="mt-4 font-display text-[clamp(2.7rem,8vw,4.8rem)] leading-[0.88] tracking-[-0.07em]">The numbers stay inside.</h1></div><div className="rounded-2xl border border-border/75 bg-background/70 p-3 text-primary"><LockKeyhole className="h-6 w-6" /></div></div><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">Enter the finance workspace password to view payout, profit, DSers product cost, campaign cost per order, and subscription data.</p><form onSubmit={onSubmit} className="mt-7"><label className="block"><span className="mb-2 block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Workspace password</span><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="h-13 w-full rounded-2xl border border-border bg-background/75 px-4 text-base text-foreground" placeholder="Enter password" /></label>{error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}<button type="submit" className="salt-primary-cta mt-5 h-12 w-full gap-2 rounded-2xl text-sm font-bold uppercase tracking-[0.12em]"><ShieldCheck className="h-4 w-4" /> Unlock finance</button></form><div className="mt-7 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Server-side session protection is enabled.</div></div></div>;
}

export default FinancePage;
