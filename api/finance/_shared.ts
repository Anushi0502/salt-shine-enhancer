import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  FinanceException,
  FinanceOrderRow,
  FinancePayout,
  FinanceSourceState,
  FinanceSubscription,
  FinanceSummary,
} from "../../src/lib/finance-types";

const SESSION_COOKIE = "salt_finance_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIMEZONE = process.env.FINANCE_TIMEZONE || "America/New_York";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://salt-online-storev2-gcs1124s-projects.vercel.app",
  "https://www.saltonlinestore.com",
  "https://saltonlinestore.com",
  "https://0309d3-72.myshopify.com",
];

type FinanceRequest = {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  method?: string;
  socket?: { remoteAddress?: string };
};

type FinanceResponse = {
  status: (code: number) => FinanceResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

type ShopifyMoneySet = {
  shopMoney?: { amount?: string | number; currencyCode?: string };
  presentmentMoney?: { amount?: string | number; currencyCode?: string };
};

type ShopifyOrder = {
  id?: string;
  name?: string;
  createdAt?: string;
  cancelledAt?: string | null;
  currencyCode?: string;
  subtotalPriceSet?: ShopifyMoneySet | null;
  totalPriceSet?: ShopifyMoneySet | null;
  currentTotalPriceSet?: ShopifyMoneySet | null;
  totalDiscountsSet?: ShopifyMoneySet | null;
  totalTaxSet?: ShopifyMoneySet | null;
  totalShippingPriceSet?: ShopifyMoneySet | null;
  lineItems?: {
    nodes?: Array<{
      quantity?: number;
      title?: string;
      originalUnitPriceSet?: ShopifyMoneySet | null;
      discountedUnitPriceSet?: ShopifyMoneySet | null;
      variant?: {
        id?: string;
        sku?: string | null;
        inventoryItem?: {
          unitCost?: { amount?: string | number; currencyCode?: string } | null;
        } | null;
      } | null;
    }>;
  };
};

type RawPayout = Record<string, unknown>;

type NormalizedOrder = {
  id: string;
  name: string;
  createdAt: string;
  currency: string;
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  netRevenueCents: number;
  taxCollectedCents: number;
  shippingIncomeCents: number;
  cogsCents: number;
  itemCount: number;
  hasCost: boolean;
  hasMissingCost: boolean;
};

type CachedSummary = { expiresAt: number; summary: FinanceSummary };

const summaryCache = new Map<string, CachedSummary>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();

const ORDER_QUERY = /* GraphQL */ `
  query FinanceOrders($query: String!, $after: String) {
    orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT, reverse: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        currencyCode
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 100) {
          nodes {
            quantity
            title
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
            variant {
              id
              sku
              inventoryItem { unitCost { amount currencyCode } }
            }
          }
        }
      }
    }
  }
`;

function headerValue(req: FinanceRequest, name: string): string {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function clientKey(req: FinanceRequest): string {
  return headerValue(req, "x-forwarded-for").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function setNoStore(res: FinanceResponse): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function allowedFinanceOrigins(): Set<string> {
  const configured = String(process.env.FINANCE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function requestOrigin(req: FinanceRequest): string {
  return headerValue(req, "origin").trim().replace(/\/+$/, "");
}

function isAllowedFinanceOrigin(req: FinanceRequest): boolean {
  const origin = requestOrigin(req);
  return Boolean(origin && allowedFinanceOrigins().has(origin));
}

export function setFinanceCors(req: FinanceRequest, res: FinanceResponse): void {
  const origin = requestOrigin(req);
  if (!origin || !allowedFinanceOrigins().has(origin)) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
}

export function handleFinanceOptions(req: FinanceRequest, res: FinanceResponse, methods: string): boolean {
  setFinanceCors(req, res);
  if (req.method !== "OPTIONS") return false;

  setNoStore(res);
  res.setHeader("Allow", methods);
  res.status(204).end();
  return true;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function financeSecret(): string | null {
  const configured = String(process.env.FINANCE_SESSION_SECRET || "").trim();
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production") return null;
  return "salt-finance-local-session-secret";
}

function createSessionToken(): string {
  const secret = financeSecret();
  if (!secret) throw new Error("FINANCE_SESSION_SECRET is not configured");

  const payload = base64Url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, nonce: base64Url(randomBytes(18)) }));
  const signature = base64Url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${signature}`;
}

function hasValidSessionToken(token: string): boolean {
  const secret = financeSecret();
  if (!secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = fromBase64Url(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  try {
    const parsed = JSON.parse(fromBase64Url(payload).toString("utf8"));
    return Number(parsed.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function readCookies(req: FinanceRequest): Record<string, string> {
  return Object.fromEntries(
    headerValue(req, "cookie")
      .split(";")
      .map((entry) => entry.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, value.join("=")]),
  );
}

function setSessionCookie(res: FinanceResponse, token: string, req?: FinanceRequest): void {
  const secure = process.env.VERCEL_ENV === "production" ? "; Secure" : "";
  const sameSite = req && isAllowedFinanceOrigin(req) ? "None" : "Lax";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=${sameSite}${secure}`);
}

export function clearFinanceSession(res: FinanceResponse, req?: FinanceRequest): void {
  const secure = process.env.VERCEL_ENV === "production" ? "; Secure" : "";
  const sameSite = req && isAllowedFinanceOrigin(req) ? "None" : "Lax";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=${sameSite}${secure}`);
}

export function getFinanceSession(req: FinanceRequest): boolean {
  return hasValidSessionToken(readCookies(req)[SESSION_COOKIE] || "");
}

export function requireFinanceSession(req: FinanceRequest, res: FinanceResponse): boolean {
  setNoStore(res);
  if (getFinanceSession(req)) return true;
  res.status(401).json({ error: "Finance authentication required" });
  return false;
}

function compareSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyScryptPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, salt, expectedHex] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || !salt || !expectedHex) return false;

  try {
    const derived = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return compareSecret(derived.toString("hex"), expectedHex);
  } catch {
    return false;
  }
}

function passwordIsConfigured(): boolean {
  return Boolean(String(process.env.FINANCE_APP_PASSWORD_HASH || process.env.FINANCE_APP_PASSWORD || "").trim());
}

function verifyPassword(password: string): boolean {
  const hash = String(process.env.FINANCE_APP_PASSWORD_HASH || "").trim();
  if (hash) return verifyScryptPassword(password, hash);

  const plain = String(process.env.FINANCE_APP_PASSWORD || "");
  return Boolean(plain) && compareSecret(password, plain);
}

export function authenticateFinancePassword(req: FinanceRequest, res: FinanceResponse): boolean {
  setNoStore(res);
  const key = clientKey(req);
  const now = Date.now();
  const state = authAttempts.get(key);
  if (state && state.resetAt > now && state.count >= 8) {
    res.status(429).json({ error: "Too many attempts. Try again shortly." });
    return false;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}) as Record<string, unknown>;
  const password = String(body.password || "");
  if (!passwordIsConfigured()) {
    res.status(503).json({ error: "Finance authentication is not configured" });
    return false;
  }

  if (!verifyPassword(password)) {
    const next = state && state.resetAt > now ? state : { count: 0, resetAt: now + 15 * 60 * 1000 };
    next.count += 1;
    authAttempts.set(key, next);
    res.status(401).json({ error: "Incorrect password" });
    return false;
  }

  authAttempts.delete(key);
  setSessionCookie(res, createSessionToken(), req);
  res.status(200).json({ authenticated: true });
  return true;
}

function parseDate(value: string | null | undefined, fallback: string): string {
  const input = String(value || fallback).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : fallback;
}

export function normalizePeriod(startInput?: string, endInput?: string) {
  const today = new Date();
  const endFallback = today.toISOString().slice(0, 10);
  const startFallback = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = parseDate(startInput, startFallback);
  const end = parseDate(endInput, endFallback);
  return start <= end ? { start, end, timezone: DEFAULT_TIMEZONE } : { start: end, end: start, timezone: DEFAULT_TIMEZONE };
}

function cents(input: unknown): number {
  const numeric = typeof input === "number" ? input : Number(String(input ?? "0"));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function moneyCents(input?: ShopifyMoneySet | null): number {
  return cents(input?.shopMoney?.amount ?? input?.presentmentMoney?.amount ?? 0);
}

function moneyCurrency(input?: ShopifyMoneySet | null): string {
  return String(input?.shopMoney?.currencyCode || input?.presentmentMoney?.currencyCode || DEFAULT_CURRENCY);
}

function percent(value: number, denominator: number): number | null {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function dateQuery(start: string, end: string): string {
  return `created_at:>=${start} created_at:<=${end}`;
}

function shopBase(): string {
  const base = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
  return new URL(base).origin;
}

function shopifyHeaders(): Record<string, string> {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "";
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };
}

function adminApiUrl(path: string): string {
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
  return `${shopBase()}/admin/api/${apiVersion}${path}`;
}

async function queryShopify(query: string, variables: Record<string, unknown>): Promise<any> {
  if (!shopifyHeaders()["X-Shopify-Access-Token"]) throw new Error("Shopify Admin credentials are not configured");

  const response = await fetch(adminApiUrl("/graphql.json"), {
    method: "POST",
    headers: shopifyHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error: { message?: string }) => error.message).filter(Boolean).join(" | ");
    throw new Error(message || `Shopify Admin request failed with ${response.status}`);
  }
  return body.data;
}

async function loadOrders(start: string, end: string): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let after: string | null = null;
  let pageCount = 0;

  while (pageCount < 20) {
    const data = await queryShopify(ORDER_QUERY, { query: dateQuery(start, end), after });
    const connection = data?.orders;
    orders.push(...(connection?.nodes || []));
    pageCount += 1;
    if (!connection?.pageInfo?.hasNextPage || !connection?.pageInfo?.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return orders;
}

async function loadPayouts(start: string, end: string): Promise<{ payouts: FinancePayout[]; state: FinanceSourceState; message?: string }> {
  if (!shopifyHeaders()["X-Shopify-Access-Token"]) {
    return { payouts: [], state: "unavailable", message: "Shopify Admin credentials are not configured" };
  }

  const url = new URL(adminApiUrl("/shopify_payments/payouts.json"));
  url.searchParams.set("date_min", `${start}T00:00:00Z`);
  url.searchParams.set("date_max", `${end}T23:59:59Z`);
  url.searchParams.set("limit", "250");

  try {
    const response = await fetch(url, { headers: shopifyHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.errors || `Shopify payouts unavailable (${response.status})`);

    const payouts = ((body?.payouts || []) as RawPayout[]).map((payout) => {
      const amountCents = cents(payout.amount);
      const feeCents = cents(payout.fee);
      const netCents = payout.net == null ? amountCents - feeCents : cents(payout.net);
      return {
        id: String(payout.id || payout.external_trace_id || "unknown"),
        issuedAt: String(payout.date || payout.issued_at || payout.created_at || ""),
        status: String(payout.status || "unknown"),
        type: String(payout.type || "deposit"),
        amountCents,
        feeCents,
        netCents,
        currency: String(payout.currency || DEFAULT_CURRENCY),
      } satisfies FinancePayout;
    });

    return { payouts, state: "connected" };
  } catch (error) {
    return { payouts: [], state: "unavailable", message: error instanceof Error ? error.message : "Shopify payouts unavailable" };
  }
}

function normalizeOrders(orders: ShopifyOrder[]): { rows: NormalizedOrder[]; currency: string; missingCostCount: number; multiCurrency: boolean } {
  const currencies = new Set<string>();
  let missingCostCount = 0;
  const rows = orders
    .filter((order) => !order.cancelledAt)
    .map((order) => {
      const currency = String(order.currencyCode || moneyCurrency(order.totalPriceSet) || DEFAULT_CURRENCY);
      currencies.add(currency);
      const subtotalCents = moneyCents(order.subtotalPriceSet);
      const discountsCents = moneyCents(order.totalDiscountsSet);
      const totalCents = moneyCents(order.totalPriceSet);
      const currentTotalCents = moneyCents(order.currentTotalPriceSet || order.totalPriceSet);
      const refundsCents = Math.max(totalCents - currentTotalCents, 0);
      const grossSalesCents = subtotalCents + discountsCents;
      const netRevenueCents = Math.max(subtotalCents - refundsCents, 0) + moneyCents(order.totalShippingPriceSet);
      const lineItems = order.lineItems?.nodes || [];
      let cogsCents = 0;
      let itemCount = 0;
      let hasCost = false;
      let hasMissingCost = false;

      for (const line of lineItems) {
        const quantity = Math.max(Number(line.quantity || 0), 0);
        itemCount += quantity;
        const unitCost = line.variant?.inventoryItem?.unitCost;
        if (unitCost?.amount != null) {
          cogsCents += cents(unitCost.amount) * quantity;
          hasCost = true;
        } else {
          hasMissingCost = true;
          missingCostCount += quantity;
        }
      }

      return {
        id: String(order.id || order.name || "unknown"),
        name: String(order.name || order.id || "Order"),
        createdAt: String(order.createdAt || ""),
        currency,
        grossSalesCents,
        discountsCents,
        refundsCents,
        netRevenueCents,
        taxCollectedCents: moneyCents(order.totalTaxSet),
        shippingIncomeCents: moneyCents(order.totalShippingPriceSet),
        cogsCents,
        itemCount,
        hasCost,
        hasMissingCost,
      } satisfies NormalizedOrder;
    });

  return {
    rows,
    currency: currencies.values().next().value || DEFAULT_CURRENCY,
    missingCostCount,
    multiCurrency: currencies.size > 1,
  };
}

function parseManualCosts(start: string, end: string): { subscriptions: FinanceSubscription[]; state: FinanceSourceState; message?: string } {
  const raw = String(process.env.FINANCE_SUBSCRIPTIONS_JSON || "").trim();
  if (!raw) return { subscriptions: [], state: "missing", message: "Add FINANCE_SUBSCRIPTIONS_JSON for Shopify, DSers, and app subscription costs." };

  try {
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    const startDate = new Date(`${start}T00:00:00Z`).getTime();
    const endDate = new Date(`${end}T23:59:59Z`).getTime();
    const periodDays = Math.max((endDate - startDate) / 86_400_000, 1);
    const subscriptions = entries.flatMap((entry) => {
      const amountCents = entry.amountCents == null ? cents(entry.amount) : Number(entry.amountCents);
      if (!Number.isFinite(amountCents) || amountCents <= 0) return [];
      const interval = String(entry.interval || "monthly").toLowerCase();
      const multiplier = interval === "annual" ? periodDays / 365 : interval === "one-time" ? 1 : periodDays / 30;
      return [{
        name: String(entry.name || "Subscription"),
        category: String(entry.category || "Software"),
        interval,
        allocatedCents: Math.round(amountCents * multiplier),
        currency: String(entry.currency || DEFAULT_CURRENCY),
        source: String(entry.source || "manual configuration"),
        active: entry.active !== false,
      } satisfies FinanceSubscription];
    });
    return { subscriptions, state: subscriptions.length ? "manual" : "missing" };
  } catch {
    return { subscriptions: [], state: "unavailable", message: "FINANCE_SUBSCRIPTIONS_JSON is not valid JSON." };
  }
}

function exception(kind: string, message: string, count: number, severity: FinanceException["severity"]): FinanceException {
  return { kind, message, count, severity };
}

export async function buildFinanceSummary(start: string, end: string): Promise<FinanceSummary> {
  const cacheKey = `${start}:${end}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.summary;

  const [ordersResult, payoutsResult] = await Promise.allSettled([loadOrders(start, end), loadPayouts(start, end)]);
  const manualCosts = parseManualCosts(start, end);
  const exceptions: FinanceException[] = [];
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const payoutData = payoutsResult.status === "fulfilled" ? payoutsResult.value : { payouts: [], state: "unavailable" as FinanceSourceState, message: "Shopify payouts unavailable" };

  if (ordersResult.status === "rejected") exceptions.push(exception("shopify-orders", ordersResult.reason?.message || "Shopify orders unavailable", 1, "high"));
  if (payoutData.message) exceptions.push(exception("shopify-payouts", payoutData.message, 1, "high"));
  if (manualCosts.message) exceptions.push(exception("subscriptions", manualCosts.message, 1, "medium"));

  const normalized = normalizeOrders(orders);
  if (normalized.missingCostCount) exceptions.push(exception("missing-cost", "Some line items do not have a Shopify/DSers cost-per-item value.", normalized.missingCostCount, "high"));
  if (normalized.multiCurrency) exceptions.push(exception("currency", "The selected period contains multiple currencies. Totals are not converted.", 1, "high"));

  const currency = normalized.currency || DEFAULT_CURRENCY;
  const grossSalesCents = normalized.rows.reduce((sum, row) => sum + row.grossSalesCents, 0);
  const discountsCents = normalized.rows.reduce((sum, row) => sum + row.discountsCents, 0);
  const refundsCents = normalized.rows.reduce((sum, row) => sum + row.refundsCents, 0);
  const netSalesCents = normalized.rows.reduce((sum, row) => sum + row.netRevenueCents - row.shippingIncomeCents, 0);
  const shippingIncomeCents = normalized.rows.reduce((sum, row) => sum + row.shippingIncomeCents, 0);
  const taxCollectedCents = normalized.rows.reduce((sum, row) => sum + row.taxCollectedCents, 0);
  const cogsCents = normalized.rows.reduce((sum, row) => sum + row.cogsCents, 0);
  const paymentFeesCents = payoutData.payouts.reduce((sum, payout) => sum + payout.feeCents, 0);
  const subscriptionCostsCents = manualCosts.subscriptions.reduce((sum, subscription) => sum + subscription.allocatedCents, 0);
  const payoutsReceivedCents = payoutData.payouts.reduce((sum, payout) => sum + payout.netCents, 0);
  const grossProfitCents = netSalesCents + shippingIncomeCents - cogsCents;
  const operatingProfitCents = grossProfitCents - paymentFeesCents - subscriptionCostsCents;
  const totalItems = normalized.rows.reduce((sum, row) => sum + row.itemCount, 0);
  const coveredItems = normalized.rows.reduce((sum, row) => sum + (row.hasCost ? row.itemCount : 0), 0);
  const feeRatio = netSalesCents + shippingIncomeCents ? paymentFeesCents / (netSalesCents + shippingIncomeCents) : 0;

  const orderRows: FinanceOrderRow[] = normalized.rows.slice(-200).reverse().map((row) => {
    const allocatedFeesCents = Math.round(row.netRevenueCents * feeRatio);
    const profitCents = row.netRevenueCents - row.cogsCents - allocatedFeesCents;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      grossSalesCents: row.grossSalesCents,
      discountsCents: row.discountsCents,
      refundsCents: row.refundsCents,
      netRevenueCents: row.netRevenueCents,
      cogsCents: row.cogsCents,
      allocatedFeesCents,
      profitCents,
      marginPercent: percent(profitCents, row.netRevenueCents),
      currency: row.currency,
      itemCount: row.itemCount,
      costCoverage: row.hasMissingCost ? (row.hasCost ? "partial" : "missing") : "complete",
    };
  });

  const sourceState = (value: FinanceSourceState): FinanceSourceState => value;
  const summary: FinanceSummary = {
    authenticated: true,
    generatedAt: new Date().toISOString(),
    currency,
    period: { start, end, timezone: DEFAULT_TIMEZONE },
    sources: {
      shopify: ordersResult.status === "fulfilled" ? "connected" : "unavailable",
      payouts: sourceState(payoutData.state),
      dsers: totalItems === 0 ? "missing" : normalized.missingCostCount ? "partial" : "connected",
      subscriptions: manualCosts.state,
      messages: [
        "DSers costs use Shopify variant cost-per-item values. Actual supplier order costs require a DSers API or secure export.",
        "Payouts are cash movement and are shown separately from operating profit.",
      ],
    },
    kpis: {
      grossSalesCents,
      discountsCents,
      refundsCents,
      netSalesCents,
      shippingIncomeCents,
      taxCollectedCents,
      cogsCents,
      paymentFeesCents,
      subscriptionCostsCents,
      payoutsReceivedCents,
      grossProfitCents,
      operatingProfitCents,
      marginPercent: percent(operatingProfitCents, netSalesCents + shippingIncomeCents),
      orderCount: normalized.rows.length,
      costCoveragePercent: totalItems ? Math.round((coveredItems / totalItems) * 1000) / 10 : null,
    },
    pnlRows: [
      { label: "Gross sales", cents: grossSalesCents, tone: "positive", detail: "Product revenue before discounts" },
      { label: "Discounts", cents: -discountsCents, tone: "negative", detail: "Promotions and order discounts" },
      { label: "Refunds and returns", cents: -refundsCents, tone: "negative", detail: "Difference between original and current order totals" },
      { label: "Net sales", cents: netSalesCents, tone: "positive", detail: "Product revenue after discounts and refunds" },
      { label: "Shipping income", cents: shippingIncomeCents, tone: "positive", detail: "Shipping charged to customers" },
      { label: "Supplier and product cost", cents: -cogsCents, tone: "negative", detail: "Shopify cost-per-item values from DSers-compatible product cost sync" },
      { label: "Payment fees", cents: -paymentFeesCents, tone: "negative", detail: "Fees reported through Shopify payouts" },
      { label: "Subscriptions and software", cents: -subscriptionCostsCents, tone: "negative", detail: "Configured recurring operating costs" },
      { label: "Operating profit", cents: operatingProfitCents, tone: operatingProfitCents >= 0 ? "positive" : "negative", detail: "Net sales plus shipping less cost, fees, and subscriptions" },
    ],
    payouts: payoutData.payouts,
    subscriptions: manualCosts.subscriptions,
    orders: orderRows,
    exceptions,
  };

  summaryCache.set(cacheKey, { expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS, summary });
  return summary;
}

export function financeResponse(res: FinanceResponse, status: number, body: unknown): void {
  setNoStore(res);
  res.status(status).json(body);
}

export function issueFinanceSession(req: FinanceRequest, res: FinanceResponse): void {
  authenticateFinancePassword(req, res);
}

export function sessionResponse(res: FinanceResponse, authenticated: boolean): void {
  financeResponse(res, 200, { authenticated });
}

export { SESSION_COOKIE, setNoStore, setSessionCookie };
