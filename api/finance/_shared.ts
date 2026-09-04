import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  FinanceException,
  FinanceCampaignSpend,
  FinanceOrderRow,
  FinancePayout,
  FinanceReconciliationSummary,
  FinanceReconciliationTotals,
  FinanceSourceState,
  FinanceSubscription,
  FinanceSummary,
} from "../../src/lib/finance-types.js";

const SESSION_COOKIE = "salt_finance_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SUMMARY_CACHE_TTL_MS = 5 * 1000;
const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIMEZONE = process.env.FINANCE_TIMEZONE || "America/New_York";
const DEFAULT_SHOPIFY_CLI_CLIENT_ID = "7e9cb568cfd431c538f36d1ad3f2b4f6";
const DEFAULT_CAMPAIGN_COST_PER_ORDER_CENTS = 1800;
// Verified in Shopify Admin billing on 2026-09-04. Keep these as overridable
// defaults because store-plan and third-party app invoice history is not
// exposed to this Admin API token, while the installed plan remains active.
const DEFAULT_SHOPIFY_GROW_MONTHLY_COST_CENTS = 10500;
const DEFAULT_DSERS_MONTHLY_COST_CENTS = 1990;
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

type ShopifyMoney = { amount?: string | number; currencyCode?: string };

type ShopifyUtmParameters = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
};

type ShopifyMarketingEvent = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

type ShopifyCustomerVisit = {
  utmParameters?: ShopifyUtmParameters | null;
  marketingEvent?: ShopifyMarketingEvent | null;
};

type ShopifyCustomerJourneySummary = {
  ready?: boolean | null;
  firstVisit?: ShopifyCustomerVisit | null;
  lastVisit?: ShopifyCustomerVisit | null;
};

type ShopifyDispute = {
  id?: string;
  type?: string;
  status?: string;
  amount?: ShopifyMoney | null;
  initiatedAt?: string;
  initiatedAs?: string;
  order?: { id?: string; name?: string } | null;
};

type ShopifyRefund = {
  id?: string;
  createdAt?: string;
  totalRefundedSet?: ShopifyMoneySet | null;
  refundLineItems?: {
    nodes?: Array<{
      subtotalSet?: ShopifyMoneySet | null;
      totalTaxSet?: ShopifyMoneySet | null;
    }>;
  } | null;
};

type ShopifyOrder = {
  id?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string | null;
  currencyCode?: string;
  subtotalPriceSet?: ShopifyMoneySet | null;
  totalPriceSet?: ShopifyMoneySet | null;
  currentTotalPriceSet?: ShopifyMoneySet | null;
  totalDiscountsSet?: ShopifyMoneySet | null;
  totalTaxSet?: ShopifyMoneySet | null;
  totalShippingPriceSet?: ShopifyMoneySet | null;
  customerJourneySummary?: ShopifyCustomerJourneySummary | null;
  disputes?: { nodes?: ShopifyDispute[] } | null;
  refunds?: ShopifyRefund[] | null;
  lineItems?: {
    nodes?: Array<{
      quantity?: number;
      title?: string;
      sku?: string | null;
      product?: { id?: string | null } | null;
      originalUnitPriceSet?: ShopifyMoneySet | null;
      discountedUnitPriceSet?: ShopifyMoneySet | null;
      variant?: {
        id?: string;
        sku?: string | null;
        title?: string | null;
        inventoryItem?: {
          unitCost?: { amount?: string | number; currencyCode?: string } | null;
        } | null;
      } | null;
    }>;
  };
};

type RawPayout = Record<string, unknown>;

type SubscriptionSource = {
  subscriptions: FinanceSubscription[];
  connected: boolean;
  message?: string;
};

type CampaignSpendSource = {
  campaigns: FinanceCampaignSpend[];
  allocationsByOrderId: Map<string, number>;
  state: FinanceSourceState;
  message?: string;
};

type EffectiveCampaignSpendSource = CampaignSpendSource & {
  configuredCostPerOrderCents: number;
  fallbackOrderCount: number;
};

type DisputeSource = {
  byOrderId: Map<string, ShopifyDispute[]>;
  disputes: ShopifyDispute[];
  state: FinanceSourceState;
  message?: string;
};

type ReconciliationSource = {
  summary: FinanceReconciliationSummary;
  state: FinanceSourceState;
  message?: string;
};

let shopifyAccessToken = String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
let shopifyRefreshToken = String(process.env.SHOPIFY_ADMIN_REFRESH_TOKEN || "").trim();
let shopifyTokenRefreshPromise: Promise<string> | null = null;

type NormalizedOrder = {
  id: string;
  name: string;
  createdAt: string;
  status: FinanceOrderRow["status"];
  currency: string;
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  returnDeductionsCents: number;
  netRevenueCents: number;
  taxCollectedCents: number;
  shippingIncomeCents: number;
  cogsCents: number;
  chargebackCents: number;
  campaignKey: string | null;
  disputeCount: number;
  itemCount: number;
  coveredItemCount: number;
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
        updatedAt
        cancelledAt
        currencyCode
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        customerJourneySummary {
          ready
          firstVisit {
            utmParameters { source medium campaign content term }
          }
          lastVisit {
            utmParameters { source medium campaign content term }
          }
        }
        disputes { id status initiatedAs }
        refunds(first: 50) {
          id
          createdAt
          totalRefundedSet { shopMoney { amount currencyCode } }
          refundLineItems(first: 100) {
            nodes {
              subtotalSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
            }
          }
        }
        lineItems(first: 100) {
          nodes {
            quantity
            title
            sku
            product { id }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
            variant {
              id
              sku
              title
              inventoryItem { unitCost { amount currencyCode } }
            }
          }
        }
      }
    }
  }
`;

const DISPUTE_QUERY = /* GraphQL */ `
  query FinanceDisputes($query: String!, $after: String) {
    disputes(first: 250, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        type
        status
        amount { amount currencyCode }
        initiatedAt
        order { id name }
      }
    }
  }
`;

const PRODUCT_VARIANT_COST_QUERY = /* GraphQL */ `
  query FinanceProductVariantCosts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        variants(first: 100) {
          nodes {
            sku
            inventoryItem { unitCost { amount currencyCode } }
          }
        }
      }
    }
  }
`;

const MARKETING_ACTIVITY_QUERY = /* GraphQL */ `
  query FinanceMarketingActivities($utm: UTMInput!) {
    marketingActivities(first: 50, utm: $utm) {
      nodes {
        id
        title
        status
        sourceAndMedium
        utmParameters { source medium campaign content term }
        adSpend { amount currencyCode }
      }
    }
  }
`;

const PAYOUT_QUERY = /* GraphQL */ `
  query FinancePayouts($query: String!) {
    shopifyPaymentsAccount {
      payouts(first: 250, query: $query, sortKey: ISSUED_AT, reverse: false) {
        nodes {
          id
          externalTraceId
          issuedAt
          status
          transactionType
          net { amount currencyCode }
          summary {
            chargesFee { amount currencyCode }
            refundsFee { amount currencyCode }
            adjustmentsFee { amount currencyCode }
            advanceFees { amount currencyCode }
            reservedFundsFee { amount currencyCode }
            retriedPayoutsFee { amount currencyCode }
            chargesGross { amount currencyCode }
            refundsFeeGross { amount currencyCode }
            adjustmentsGross { amount currencyCode }
            advanceGross { amount currencyCode }
            reservedFundsGross { amount currencyCode }
            retriedPayoutsGross { amount currencyCode }
          }
        }
      }
    }
  }
`;

const APP_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query FinanceAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        createdAt
        currentPeriodEnd
        test
        trialDays
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price { amount currencyCode }
              }
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
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
  const authorization = headerValue(req, "authorization");
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return hasValidSessionToken(bearerToken || readCookies(req)[SESSION_COOKIE] || "");
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
  const token = createSessionToken();
  setSessionCookie(res, token, req);
  res.status(200).json({ authenticated: true, token });
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

function formatMoneyText(amountCents: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountCents / 100);
}

function percent(value: number, denominator: number): number | null {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function dateQuery(start: string, end: string): string {
  return `created_at:>=${start}T00:00:00Z created_at:<=${end}T23:59:59Z`;
}

function updatedDateQuery(start: string, end: string): string {
  return `updated_at:>=${start}T00:00:00Z updated_at:<=${end}T23:59:59Z`;
}

function shopBase(): string {
  const base = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
  return new URL(base).origin;
}

function hasShopifyCredentials(): boolean {
  return Boolean(shopifyAccessToken || shopifyRefreshToken);
}

function shopifyHeaders(token = shopifyAccessToken): Record<string, string> {
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

function isInvalidShopifyToken(message: string, status?: number): boolean {
  return status === 401 || /invalid api key|invalid.*access token|unrecognized login|wrong password/i.test(message);
}

async function refreshShopifyAccessToken(force = false): Promise<string> {
  if (!shopifyRefreshToken) return shopifyAccessToken;
  if (!force && shopifyAccessToken) return shopifyAccessToken;
  if (shopifyTokenRefreshPromise) return shopifyTokenRefreshPromise;

  shopifyTokenRefreshPromise = (async () => {
    const response = await fetch(`${shopBase()}/admin/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLI_CLIENT_ID || DEFAULT_SHOPIFY_CLI_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: shopifyRefreshToken,
      }),
    });
    const body = await response.json().catch(() => ({}));
    const message = errorMessage(body?.errors ?? body?.error ?? body?.message);
    if (!response.ok || typeof body?.access_token !== "string" || typeof body?.refresh_token !== "string") {
      throw new Error(`Shopify Admin token refresh failed: ${message || `HTTP ${response.status}`}`);
    }
    shopifyAccessToken = body.access_token;
    shopifyRefreshToken = body.refresh_token;
    return shopifyAccessToken;
  })().finally(() => {
    shopifyTokenRefreshPromise = null;
  });

  return shopifyTokenRefreshPromise;
}

async function currentShopifyAccessToken(): Promise<string> {
  if (shopifyAccessToken) return shopifyAccessToken;
  return refreshShopifyAccessToken();
}

async function queryShopify(query: string, variables: Record<string, unknown>): Promise<any> {
  if (!hasShopifyCredentials()) throw new Error("Shopify Admin credentials are not configured");

  let token = await currentShopifyAccessToken();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(adminApiUrl("/graphql.json"), {
      method: "POST",
      headers: shopifyHeaders(token),
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    const message = formatShopifyApiError(body, response.status);
    if (response.ok && !message) return body.data;

    if (attempt === 0 && shopifyRefreshToken && isInvalidShopifyToken(message, response.status)) {
      token = await refreshShopifyAccessToken(true);
      continue;
    }
    throw new Error(message || `Shopify Admin request failed with ${response.status}`);
  }

  throw new Error("Shopify Admin request failed");
}

function errorMessage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message.trim();
  if (typeof record.error === "string") return record.error.trim();
  if (Array.isArray(record.errors)) return record.errors.map(errorMessage).filter(Boolean).join(" | ");

  return Object.entries(record)
    .flatMap(([key, entry]) => {
      const message = errorMessage(entry);
      return message ? `${key}: ${message}` : [];
    })
    .join(" | ");
}

export function formatShopifyApiError(body: unknown, status: number): string {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const candidate = payload.errors ?? payload.error ?? payload.message;
  const message = errorMessage(candidate);
  if (!message) return "";

  if (/invalid api key|invalid.*access token|unrecognized login|wrong password|unauthorized/i.test(message)) {
    return "Shopify Admin access token is invalid or expired. Reconnect the finance app authorization and update the deployed finance API token.";
  }

  if (/access denied|missing[_ ]shopify[_ ]permission|missing.*permission|required access/i.test(message)) {
    return `Shopify Admin permission is missing: ${message}`;
  }

  return status === 401 || status === 403 ? `Shopify Admin authorization failed: ${message}` : message;
}

async function loadOrders(start: string, end: string): Promise<ShopifyOrder[]> {
  const [createdOrders, updatedOrders] = await Promise.all([
    loadOrdersByQuery(dateQuery(start, end)),
    // Refunds, cancellations, and dispute updates can belong to an older
    // order. Pull orders updated in the period so those event records are not
    // silently omitted from the period reconciliation.
    loadOrdersByQuery(updatedDateQuery(start, end)),
  ]);
  const ordersById = new Map<string, ShopifyOrder>();
  for (const order of [...createdOrders, ...updatedOrders]) {
    const key = String(order.id || order.name || "unknown");
    ordersById.set(key, order);
  }
  const orders = [...ordersById.values()];

  await hydrateUnresolvedOrderCosts(orders);
  return orders;
}

async function loadOrdersByQuery(query: string): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let after: string | null = null;
  let pageCount = 0;

  while (pageCount < 20) {
    const data = await queryShopify(ORDER_QUERY, { query, after });
    const connection = data?.orders;
    orders.push(...(connection?.nodes || []));
    pageCount += 1;
    if (!connection?.pageInfo?.hasNextPage || !connection?.pageInfo?.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return orders;
}

async function hydrateUnresolvedOrderCosts(orders: ShopifyOrder[]): Promise<void> {
  const productIds = new Set<string>();
  for (const order of orders) {
    for (const line of order.lineItems?.nodes || []) {
      if (!line.variant?.inventoryItem?.unitCost && line.product?.id) productIds.add(String(line.product.id));
    }
  }
  if (!productIds.size) return;

  try {
    const data = await queryShopify(PRODUCT_VARIANT_COST_QUERY, { ids: [...productIds] });
    const costsByProduct = new Map<string, Map<string, ShopifyMoney>>();
    for (const product of data?.nodes || []) {
      const productId = String(product?.id || "").trim();
      if (!productId) continue;
      const costsBySku = new Map<string, ShopifyMoney>();
      for (const variant of product?.variants?.nodes || []) {
        const sku = String(variant?.sku || "").trim();
        const unitCost = variant?.inventoryItem?.unitCost;
        if (sku && unitCost?.amount != null) costsBySku.set(sku, unitCost);
      }
      if (costsBySku.size) costsByProduct.set(productId, costsBySku);
    }

    for (const order of orders) {
      for (const line of order.lineItems?.nodes || []) {
        if (line.variant?.inventoryItem?.unitCost || !line.product?.id) continue;
        const sku = String(line.sku || line.variant?.sku || "").trim();
        const unitCost = costsByProduct.get(String(line.product.id))?.get(sku);
        if (unitCost) {
          line.variant = {
            ...(line.variant || {}),
            sku: line.variant?.sku || line.sku,
            inventoryItem: { ...(line.variant?.inventoryItem || {}), unitCost },
          };
        }
      }
    }
  } catch {
    // Shopify's primary order response remains valid; unresolved costs stay
    // visible as a coverage exception instead of being estimated.
  }
}

function simpleMoneyCents(input?: ShopifyMoney | null): number {
  return cents(input?.amount ?? 0);
}

function simpleMoneyCurrency(input?: ShopifyMoney | null): string {
  return String(input?.currencyCode || DEFAULT_CURRENCY);
}

function normalizeCampaignPart(value: unknown): string {
  return String(value || "").trim();
}

function campaignKey(source: string, medium: string, campaign: string): string {
  return [source, medium, campaign].map((part) => normalizeCampaignPart(part).toLowerCase()).join("|");
}

function extractAttributionVisit(order: ShopifyOrder): ShopifyCustomerVisit | null {
  const journey = order.customerJourneySummary;
  if (!journey || journey.ready === false) return null;
  return journey.lastVisit || journey.firstVisit || null;
}

function extractCampaignAttribution(order: ShopifyOrder): { key: string; source: string; medium: string; campaign: string; title: string } | null {
  const visit = extractAttributionVisit(order);
  if (!visit) return null;

  const source = normalizeCampaignPart(visit.utmParameters?.source ?? visit.marketingEvent?.utmSource);
  const medium = normalizeCampaignPart(visit.utmParameters?.medium ?? visit.marketingEvent?.utmMedium);
  const campaign = normalizeCampaignPart(visit.utmParameters?.campaign ?? visit.marketingEvent?.utmCampaign);
  if (!source && !medium && !campaign) return null;

  const title = campaign || source || medium || "Attributed campaign";
  return { key: campaignKey(source, medium, campaign), source, medium, campaign, title };
}

async function loadCampaignCosts(orders: ShopifyOrder[], start: string, end: string): Promise<CampaignSpendSource> {
  if (!hasShopifyCredentials()) {
    return { campaigns: [], allocationsByOrderId: new Map(), state: "unavailable", message: "Shopify Admin credentials are not configured" };
  }

  const groups = new Map<string, { source: string; medium: string; campaign: string; title: string; orderRows: Array<{ id: string; createdAt: string }> }>();
  for (const order of orders) {
    const attribution = extractCampaignAttribution(order);
    if (!attribution) continue;
    const existing = groups.get(attribution.key) || {
      source: attribution.source,
      medium: attribution.medium,
      campaign: attribution.campaign,
      title: attribution.title,
      orderRows: [],
    };
    existing.orderRows.push({ id: String(order.id || order.name || "unknown"), createdAt: String(order.createdAt || "") });
    groups.set(attribution.key, existing);
  }
  if (!groups.size) return { campaigns: [], allocationsByOrderId: new Map(), state: "connected", message: "Shopify marketing access is connected; no campaign activity was attributed to the selected orders." };

  const allocationsByOrderId = new Map<string, number>();
  const campaigns: FinanceCampaignSpend[] = [];
  const errors: string[] = [];
  let resolvedGroups = 0;
  const results = await Promise.allSettled([...groups.values()].map(async (group) => {
    // Shopify's UTMInput requires all three fields, including an empty
    // campaign value for organic/source-only attribution.
    const utm: Record<string, string> = {
      source: group.source,
      medium: group.medium,
      campaign: group.campaign,
    };
    const data = await queryShopify(MARKETING_ACTIVITY_QUERY, { utm });
    const activities = (data?.marketingActivities?.nodes || []) as Array<Record<string, any>>;
    const adSpendCents = activities.reduce((sum, activity) => sum + simpleMoneyCents(activity.adSpend), 0);
    const orderRows = [...group.orderRows].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const base = orderRows.length ? Math.floor(adSpendCents / orderRows.length) : 0;
    const remainder = orderRows.length ? adSpendCents % orderRows.length : 0;
    orderRows.forEach((row, index) => allocationsByOrderId.set(row.id, (allocationsByOrderId.get(row.id) || 0) + base + (index < remainder ? 1 : 0)));
    if (adSpendCents > 0) {
      campaigns.push({
        key: campaignKey(group.source, group.medium, group.campaign),
        title: group.title,
        source: group.source || "unknown",
        medium: group.medium || "unknown",
        campaign: group.campaign || "unknown",
        adSpendCents,
        allocatedCents: adSpendCents,
        currency: String(activities[0]?.adSpend?.currencyCode || DEFAULT_CURRENCY),
        orderCount: orderRows.length,
      });
    }
    resolvedGroups += 1;
  }));
  for (const result of results) {
    if (result.status === "rejected") errors.push(result.reason instanceof Error ? result.reason.message : "Shopify marketing activities unavailable");
  }
  if (!resolvedGroups) return { campaigns: [], allocationsByOrderId: new Map(), state: "unavailable", message: errors[0] || "Shopify marketing activity access is unavailable. The read_marketing_events scope is required." };

  const hasPartialAllocation = orders.some((order) => extractCampaignAttribution(order) && !allocationsByOrderId.has(String(order.id || order.name || "unknown")));
  const partialMessage = hasPartialAllocation ? "Some Shopify marketing activities were not fully matched to attributed orders and were left out of the campaign allocation." : undefined;
  const noSpendMessage = campaigns.length ? undefined : "Shopify marketing access is connected; no paid campaign spend was returned for the selected period.";
  return {
    campaigns: campaigns.sort((left, right) => right.allocatedCents - left.allocatedCents || left.title.localeCompare(right.title)),
    allocationsByOrderId,
    state: errors.length || hasPartialAllocation ? "partial" : "connected",
    message: [errors.join(" | "), partialMessage, noSpendMessage].filter(Boolean).join(" | ") || undefined,
  };
}

function configuredCampaignCostPerOrderCents(): number {
  const raw = process.env.FINANCE_CAMPAIGN_COST_PER_ORDER
    ?? process.env.SALT_VARIANT_COST_CAMPAIGN_COST_PER_ORDER
    ?? String(DEFAULT_CAMPAIGN_COST_PER_ORDER_CENTS / 100);
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : DEFAULT_CAMPAIGN_COST_PER_ORDER_CENTS;
}

function applyEffectiveCampaignCosts(
  rows: NormalizedOrder[],
  campaignData: CampaignSpendSource,
  currency: string,
): EffectiveCampaignSpendSource {
  const configuredCostPerOrderCents = configuredCampaignCostPerOrderCents();
  const allocationsByOrderId = new Map<string, number>();
  let fallbackOrderCount = 0;

  for (const row of rows) {
    const shopifyAllocatedCents = campaignData.allocationsByOrderId.get(row.id);
    if (shopifyAllocatedCents != null && shopifyAllocatedCents > 0) {
      allocationsByOrderId.set(row.id, shopifyAllocatedCents);
      continue;
    }
    allocationsByOrderId.set(row.id, configuredCostPerOrderCents);
    fallbackOrderCount += 1;
  }

  const campaigns = [...campaignData.campaigns];
  if (fallbackOrderCount && configuredCostPerOrderCents > 0) {
    const configuredTotalCents = fallbackOrderCount * configuredCostPerOrderCents;
    campaigns.push({
      key: "configured|per-order|campaign-cost",
      title: "Campaign cost per order",
      source: "configured",
      medium: "per-order",
      campaign: `${(configuredCostPerOrderCents / 100).toFixed(2)} per order`,
      adSpendCents: configuredTotalCents,
      allocatedCents: configuredTotalCents,
      currency,
      orderCount: fallbackOrderCount,
    });
  }

  const state: FinanceSourceState = fallbackOrderCount ? "partial" : campaignData.state;
  const message = [
    campaignData.message,
    fallbackOrderCount
      ? `${formatMoneyText(configuredCostPerOrderCents, currency)} campaign cost per order was applied to ${fallbackOrderCount} non-cancelled order${fallbackOrderCount === 1 ? "" : "s"} where Shopify paid campaign spend was not returned.`
      : undefined,
  ].filter(Boolean).join(" | ");

  return {
    campaigns: campaigns.sort((left, right) => right.allocatedCents - left.allocatedCents || left.title.localeCompare(right.title)),
    allocationsByOrderId,
    state,
    message: message || undefined,
    configuredCostPerOrderCents,
    fallbackOrderCount,
  };
}

function isChargebackLoss(dispute: ShopifyDispute): boolean {
  const type = String(dispute.type || dispute.initiatedAs || "").toLowerCase();
  const status = String(dispute.status || "").toLowerCase();
  if (!type.includes("chargeback")) return false;
  return ["lost", "accepted", "expired"].includes(status);
}

function isPendingChargeback(dispute: ShopifyDispute): boolean {
  const type = String(dispute.type || dispute.initiatedAs || "").toLowerCase();
  const status = String(dispute.status || "").toLowerCase();
  return type.includes("chargeback") && /under[_ -]?review|pending|open/.test(status);
}

async function loadDisputes(start: string, end: string): Promise<DisputeSource> {
  if (!hasShopifyCredentials()) return { byOrderId: new Map(), disputes: [], state: "unavailable", message: "Shopify Admin credentials are not configured" };
  const disputes: ShopifyDispute[] = [];
  try {
    let after: string | null = null;
    let pageCount = 0;
    while (pageCount < 20) {
      const data = await queryShopify(DISPUTE_QUERY, { query: `initiated_at:>=${start}T00:00:00Z initiated_at:<=${end}T23:59:59Z`, after });
      const connection = data?.disputes;
      disputes.push(...((connection?.nodes || []) as ShopifyDispute[]));
      pageCount += 1;
      if (!connection?.pageInfo?.hasNextPage || !connection?.pageInfo?.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
    const byOrderId = new Map<string, ShopifyDispute[]>();
    for (const dispute of disputes) {
      const orderId = String(dispute.order?.id || "");
      if (!orderId) continue;
      byOrderId.set(orderId, [...(byOrderId.get(orderId) || []), dispute]);
    }
    return { byOrderId, disputes, state: "connected" };
  } catch (error) {
    return { byOrderId: new Map(), disputes: [], state: "unavailable", message: error instanceof Error ? error.message : "Shopify disputes unavailable" };
  }
}

function isDateInPeriod(value: string | undefined, start: string, end: string): boolean {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= new Date(`${start}T00:00:00Z`).getTime() && timestamp <= new Date(`${end}T23:59:59Z`).getTime();
}

function orderPeriodRefundCents(order: ShopifyOrder, start: string, end: string): number {
  return (Array.isArray(order.refunds) ? order.refunds : [])
    .filter((refund) => isDateInPeriod(refund.createdAt, start, end))
    .reduce((sum, refund) => sum + moneyCents(refund.totalRefundedSet), 0);
}

function refundLineSubtotalCents(refund: ShopifyRefund): number {
  return (refund.refundLineItems?.nodes || []).reduce((sum, line) => sum + Math.max(moneyCents(line.subtotalSet), 0), 0);
}

function orderPeriodReturnDeductionCents(order: ShopifyOrder, start: string, end: string): number {
  let remainingProductCents = Math.max(moneyCents(order.subtotalPriceSet), 0);
  return (Array.isArray(order.refunds) ? order.refunds : [])
    .filter((refund) => isDateInPeriod(refund.createdAt, start, end))
    .reduce((sum, refund) => {
      if (remainingProductCents <= 0) return sum;
      const lineSubtotalCents = refundLineSubtotalCents(refund);
      const refundCents = Math.max(moneyCents(refund.totalRefundedSet), 0);
      // Shopify can record a payment refund without refundLineItems (for example,
      // a full refund or a payment-discrepancy refund). Keep product net sales
      // accurate by capping that cash refund at the order's product subtotal.
      const candidateCents = lineSubtotalCents || refundCents;
      const appliedCents = Math.min(candidateCents, remainingProductCents);
      remainingProductCents -= appliedCents;
      return sum + appliedCents;
    }, 0);
}

function emptyReconciliationTotals(): FinanceReconciliationTotals {
  return {
    pendingPayoutCents: 0,
    payoutPaidCents: 0,
    orderCostCents: 0,
    billCostCents: 0,
    campaignCostCents: 0,
    feeCents: 0,
    profitCents: 0,
    rowCount: 0,
    paidCount: 0,
    pendingCount: 0,
  };
}

function isPaidPayout(status: string): boolean {
  return /paid|completed|complete|success|deposited|settled/i.test(status);
}

function isPendingPayout(status: string): boolean {
  return /pending|in[_ -]?transit|scheduled|unpaid|open/i.test(status);
}

function buildAutomaticReconciliation(
  payoutData: { payouts: FinancePayout[]; state: FinanceSourceState },
  orderCostCents: number,
  campaignCostCents: number,
  billCostCents: number,
): ReconciliationSource {
  const totals = emptyReconciliationTotals();
  for (const payout of payoutData.payouts) {
    if (isPendingPayout(payout.status)) totals.pendingPayoutCents += payout.netCents;
    if (isPaidPayout(payout.status)) totals.payoutPaidCents += payout.netCents;
  }
  totals.orderCostCents = orderCostCents;
  totals.billCostCents = billCostCents;
  totals.campaignCostCents = campaignCostCents;
  totals.feeCents = payoutData.payouts.reduce((sum, payout) => sum + payout.feeCents, 0);
  totals.rowCount = payoutData.payouts.length;
  totals.paidCount = payoutData.payouts.filter((payout) => isPaidPayout(payout.status)).length;
  totals.pendingCount = payoutData.payouts.filter((payout) => isPendingPayout(payout.status)).length;
  // Payout net values already include Shopify payment fees. Keep the fee
  // column visible, but do not subtract it a second time from cash profit.
  totals.profitCents = totals.pendingPayoutCents + totals.payoutPaidCents - totals.orderCostCents - totals.billCostCents - totals.campaignCostCents;
  const state = payoutData.state;
  const message = state === "connected"
    ? "Live reconciliation is calculated from Shopify payouts, orders, product costs, campaign attribution, and app billing."
    : "Live cash reconciliation is waiting for Shopify payout access; the page will retry automatically when access is restored.";
  return { state, message, summary: { state, message, totals, rows: [] } };
}

function payoutDateQuery(start: string, end: string): string {
  return `issued_at:>=${start}T00:00:00Z issued_at:<=${end}T23:59:59Z`;
}

function isShopifyPaymentsAccessError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("shopifypaymentsaccount") ||
    normalized.includes("read_shopify_payments_payouts") ||
    normalized.includes("merchant approval") ||
    normalized.includes("payments api") ||
    normalized.includes("shopify payouts require")
  );
}

function shopifyPayoutsAccessMessage(): string {
  return "Shopify payouts need merchant-approved Payments API access. The live finance view will retry automatically when that access is granted.";
}

function sumMoneyCents(values: Array<ShopifyMoney | null | undefined>): number {
  return values.reduce((sum, value) => sum + simpleMoneyCents(value), 0);
}

function normalizeGraphqlPayouts(nodes: Array<Record<string, any>>): FinancePayout[] {
  return nodes.map((payout) => {
    const summary = payout.summary || {};
    const feeCents = sumMoneyCents([
      summary.chargesFee,
      summary.refundsFee,
      summary.adjustmentsFee,
      summary.advanceFees,
      summary.reservedFundsFee,
      summary.retriedPayoutsFee,
    ]);
    const grossCents = sumMoneyCents([
      summary.chargesGross,
      summary.refundsFeeGross,
      summary.adjustmentsGross,
      summary.advanceGross,
      summary.reservedFundsGross,
      summary.retriedPayoutsGross,
    ]);
    const netCents = simpleMoneyCents(payout.net);
    return {
      id: String(payout.externalTraceId || payout.legacyResourceId || payout.id || "unknown"),
      issuedAt: String(payout.issuedAt || ""),
      status: String(payout.status || "unknown").toLowerCase(),
      type: String(payout.transactionType || "deposit").toLowerCase(),
      amountCents: grossCents || netCents + feeCents,
      feeCents,
      netCents,
      currency: simpleMoneyCurrency(payout.net),
    } satisfies FinancePayout;
  });
}

async function loadPayouts(start: string, end: string): Promise<{ payouts: FinancePayout[]; state: FinanceSourceState; message?: string }> {
  if (!hasShopifyCredentials()) return { payouts: [], state: "unavailable", message: "Shopify Admin credentials are not configured" };

  let graphqlError = "";
  try {
    const data = await queryShopify(PAYOUT_QUERY, { query: payoutDateQuery(start, end) });
    const account = data?.shopifyPaymentsAccount;
    if (!account) throw new Error("Shopify Payments account is not available for this store");
    return { payouts: normalizeGraphqlPayouts(account.payouts?.nodes || []), state: "connected" };
  } catch (error) {
    graphqlError = error instanceof Error ? error.message : "Shopify Payments GraphQL unavailable";
  }

  let restError = "";
  try {
    const url = new URL(adminApiUrl("/shopify_payments/payouts.json"));
    url.searchParams.set("date_min", `${start}T00:00:00Z`);
    url.searchParams.set("date_max", `${end}T23:59:59Z`);
    url.searchParams.set("limit", "250");
    let token = await currentShopifyAccessToken();
    let response = await fetch(url, { headers: shopifyHeaders(token) });
    if (response.status === 401 && shopifyRefreshToken) {
      token = await refreshShopifyAccessToken(true);
      response = await fetch(url, { headers: shopifyHeaders(token) });
    }
    const body = await response.json();
    if (!response.ok) throw new Error(formatShopifyApiError(body, response.status) || `Shopify payouts unavailable (${response.status})`);

    const payouts = ((body?.payouts || []) as RawPayout[]).map((payout) => {
      const summary = (payout.summary && typeof payout.summary === "object")
        ? payout.summary as Record<string, unknown>
        : {};
      const summaryFeeCents = [
        "charges_fee_amount",
        "refunds_fee_amount",
        "adjustments_fee_amount",
        "advance_fees_amount",
        "reserved_funds_fee_amount",
        "retried_payouts_fee_amount",
      ].reduce((sum, key) => sum + cents(summary[key]), 0);
      const feeCents = summaryFeeCents || cents(payout.fee);
      // REST payout.amount is the cash deposited, not gross charges. The
      // summary contains the gross and fee components separately.
      const amountCents = cents(payout.amount);
      const netCents = payout.net == null ? amountCents : cents(payout.net);
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
    restError = error instanceof Error ? error.message : "Shopify payouts unavailable";
    if (isShopifyPaymentsAccessError(restError)) return { payouts: [], state: "partial", message: shopifyPayoutsAccessMessage() };
  }

  const details = [graphqlError, restError].filter(Boolean).join(" | ");
  if (details && isShopifyPaymentsAccessError(details)) {
    return { payouts: [], state: "partial", message: shopifyPayoutsAccessMessage() };
  }
  return {
    payouts: [],
    state: "unavailable",
    message: details || "Shopify payouts unavailable. Merchant approval for read_shopify_payments_payouts is required.",
  };
}

function normalizeOrders(
  orders: ShopifyOrder[],
  disputesByOrderId: Map<string, ShopifyDispute[]>,
  start: string,
  end: string,
): {
  rows: NormalizedOrder[];
  currency: string;
  missingCostCount: number;
  missingCostLabels: string[];
  periodRefundsCents: number;
  reportOrderRefundsCents: number;
  updatedOrderRefundsCents: number;
  nonCancelledPeriodRefundsCents: number;
  returnDeductionsCents: number;
  cancelledOrderRefundsCents: number;
  multiCurrency: boolean;
} {
  const currencies = new Set<string>();
  let missingCostCount = 0;
  const missingCostLabels = new Set<string>();
  const rows = orders
    .filter((order) => isDateInPeriod(order.createdAt, start, end) && !order.cancelledAt)
    .map((order) => {
      const currency = String(order.currencyCode || moneyCurrency(order.totalPriceSet) || DEFAULT_CURRENCY);
      currencies.add(currency);
      const subtotalCents = moneyCents(order.subtotalPriceSet);
      const discountsCents = moneyCents(order.totalDiscountsSet);
      const refundsCents = orderPeriodRefundCents(order, start, end);
      const returnDeductionsCents = orderPeriodReturnDeductionCents(order, start, end);
      const grossSalesCents = subtotalCents + discountsCents;
      const netRevenueCents = subtotalCents - returnDeductionsCents + moneyCents(order.totalShippingPriceSet);
      const lineItems = order.lineItems?.nodes || [];
      const orderId = String(order.id || order.name || "unknown");
      const disputes = disputesByOrderId.get(orderId) || order.disputes?.nodes || [];
      const disputeCount = disputes.length;
      const chargebackCents = disputes.reduce((sum, dispute) => sum + (isChargebackLoss(dispute) ? simpleMoneyCents(dispute.amount) : 0), 0);
      const campaign = extractCampaignAttribution(order);
      let cogsCents = 0;
      let itemCount = 0;
      let coveredItemCount = 0;
      let hasCost = false;
      let hasMissingCost = false;

      for (const line of lineItems) {
        const quantity = Math.max(Number(line.quantity || 0), 0);
        itemCount += quantity;
        const unitCost = line.variant?.inventoryItem?.unitCost;
        const unitCostCents = unitCost?.amount != null ? cents(unitCost.amount) : null;
        if (unitCostCents != null) {
          cogsCents += unitCostCents * quantity;
          hasCost = true;
          coveredItemCount += quantity;
        } else {
          hasMissingCost = true;
          missingCostCount += quantity;
          missingCostLabels.add(`${String(order.name || order.id || "Order")}: ${String(line.title || line.variant?.title || "Untitled product")} x${quantity}`);
        }
      }

      return {
        id: orderId,
        name: String(order.name || order.id || "Order"),
        createdAt: String(order.createdAt || ""),
        status: order.cancelledAt
          ? (disputeCount ? "cancelled-disputed" : "cancelled")
          : disputeCount
            ? "disputed"
            : "open",
        currency,
        grossSalesCents,
        discountsCents,
        refundsCents,
        returnDeductionsCents,
        netRevenueCents,
        taxCollectedCents: moneyCents(order.totalTaxSet),
        shippingIncomeCents: moneyCents(order.totalShippingPriceSet),
        cogsCents,
        chargebackCents,
        campaignKey: campaign?.key || null,
        disputeCount,
        itemCount,
        coveredItemCount,
        hasCost,
        hasMissingCost,
      } satisfies NormalizedOrder;
    });

  const reportOrders = orders.filter((order) => isDateInPeriod(order.createdAt, start, end));
  const reportOrderRefundsCents = reportOrders.reduce((sum, order) => sum + orderPeriodRefundCents(order, start, end), 0);
  const periodRefundsCents = orders.reduce((sum, order) => sum + orderPeriodRefundCents(order, start, end), 0);

  return {
    rows,
    currency: currencies.values().next().value || DEFAULT_CURRENCY,
    missingCostCount,
    missingCostLabels: [...missingCostLabels],
    // The union includes orders created before the report period so refund
    // events are still available for cash reconciliation. Accrual P&L metrics
    // must stay at the report-order grain, otherwise an old order refunded in
    // this month reduces this month's sales a second time.
    periodRefundsCents,
    reportOrderRefundsCents,
    updatedOrderRefundsCents: Math.max(periodRefundsCents - reportOrderRefundsCents, 0),
    nonCancelledPeriodRefundsCents: reportOrders.filter((order) => !order.cancelledAt).reduce((sum, order) => sum + orderPeriodRefundCents(order, start, end), 0),
    returnDeductionsCents: reportOrders.filter((order) => !order.cancelledAt).reduce((sum, order) => sum + orderPeriodReturnDeductionCents(order, start, end), 0),
    cancelledOrderRefundsCents: reportOrders.filter((order) => Boolean(order.cancelledAt)).reduce((sum, order) => sum + orderPeriodRefundCents(order, start, end), 0),
    multiCurrency: currencies.size > 1,
  };
}

function periodDays(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T23:59:59Z`).getTime();
  return Math.max((endTime - startTime) / 86_400_000, 1);
}

function recurringMultiplier(interval: string, days: number): number {
  return interval.toLowerCase() === "annual" ? days / 365 : days / 30;
}

function configuredMonthlyCostCents(name: string, fallbackCents: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallbackCents;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : fallbackCents;
}

function monthlyAllocationCents(amountCents: number, start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endExclusive = new Date(`${end}T00:00:00Z`).getTime() + 86_400_000;
  if (!Number.isFinite(startTime) || !Number.isFinite(endExclusive) || endExclusive <= startTime) return 0;

  let cursor = new Date(Date.UTC(new Date(startTime).getUTCFullYear(), new Date(startTime).getUTCMonth(), 1));
  let total = 0;
  while (cursor.getTime() < endExclusive) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const monthStart = Date.UTC(year, month, 1);
    const nextMonthStart = Date.UTC(year, month + 1, 1);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const overlapStart = Math.max(startTime, monthStart);
    const overlapEnd = Math.min(endExclusive, nextMonthStart);
    if (overlapEnd > overlapStart) {
      total += amountCents * ((overlapEnd - overlapStart) / 86_400_000) / daysInMonth;
    }
    cursor = new Date(nextMonthStart);
  }
  return Math.round(total);
}

async function loadShopifySubscriptions(start: string, end: string): Promise<SubscriptionSource> {
  if (!hasShopifyCredentials()) {
    return { subscriptions: [], connected: false, message: "Shopify Admin credentials are not configured" };
  }

  try {
    const data = await queryShopify(APP_SUBSCRIPTION_QUERY, {});
    const days = periodDays(start, end);
    const subscriptions = (data?.currentAppInstallation?.activeSubscriptions || []).flatMap((subscription: Record<string, any>) => {
      if (subscription.test) return [];
      return (subscription.lineItems || []).flatMap((lineItem: Record<string, any>, index: number) => {
        const pricing = lineItem?.plan?.pricingDetails;
        if (pricing?.__typename !== "AppRecurringPricing" || pricing.price?.amount == null) return [];
        const interval = String(pricing.interval || "EVERY_30_DAYS").toLowerCase().replaceAll("every_30_days", "monthly");
        const amountCents = simpleMoneyCents(pricing.price);
        return [{
          name: `${String(subscription.name || "Shopify app subscription")}${index ? ` ${index + 1}` : ""}`,
          category: "Shopify app",
          interval,
          allocatedCents: Math.round(amountCents * recurringMultiplier(interval, days)),
          currency: simpleMoneyCurrency(pricing.price),
          source: "Shopify Admin billing",
          active: String(subscription.status || "ACTIVE").toLowerCase() === "active",
        } satisfies FinanceSubscription];
      });
    });
    const verifiedStoreBilling: FinanceSubscription[] = [
      {
        name: "Shopify Grow",
        category: "Shopify plan",
        interval: "monthly",
        allocatedCents: monthlyAllocationCents(
          configuredMonthlyCostCents("FINANCE_SHOPIFY_GROW_MONTHLY_COST", DEFAULT_SHOPIFY_GROW_MONTHLY_COST_CENTS),
          start,
          end,
        ),
        currency: "USD",
        source: "Shopify Admin billing",
        active: true,
      },
      {
        name: "DSers-AliExpress Dropshipping",
        category: "External app",
        interval: "monthly",
        allocatedCents: monthlyAllocationCents(
          configuredMonthlyCostCents("FINANCE_DSERS_MONTHLY_COST", DEFAULT_DSERS_MONTHLY_COST_CENTS),
          start,
          end,
        ),
        currency: "USD",
        source: "Shopify Admin installed-app billing",
        active: true,
      },
    ];
    return {
      subscriptions: [...verifiedStoreBilling, ...subscriptions],
      connected: true,
    };
  } catch (error) {
    return { subscriptions: [], connected: false, message: error instanceof Error ? error.message : "Shopify app subscriptions unavailable" };
  }
}

function exception(kind: string, message: string, count: number, severity: FinanceException["severity"]): FinanceException {
  return { kind, message, count, severity };
}

function exceptionGroupKey(item: FinanceException): string {
  const message = item.message.toLowerCase();
  if (message.includes("access token is invalid") || message.includes("token refresh failed")) return "shopify-auth";
  if (message.includes("read_shopify_payments") || message.includes("shopifypaymentsaccount") || message.includes("payments access")) return "shopify-payments-access";
  if (message.includes("read_marketing_events") || message.includes("marketing activity")) return "shopify-marketing-access";
  return `${item.kind}:${item.message}`;
}

function consolidateExceptions(items: FinanceException[]): FinanceException[] {
  const grouped = new Map<string, FinanceException>();
  const severityRank = { low: 1, medium: 2, high: 3 } as const;
  for (const item of items) {
    const key = exceptionGroupKey(item);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item, kind: key.split(":", 1)[0] });
      continue;
    }
    existing.count = Math.max(existing.count, item.count);
    if (severityRank[item.severity] > severityRank[existing.severity]) existing.severity = item.severity;
  }
  return [...grouped.values()];
}

export async function buildFinanceSummary(start: string, end: string): Promise<FinanceSummary> {
  const cacheKey = `${start}:${end}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.summary;

  const [ordersResult, payoutsResult, shopifySubscriptionsResult, disputesResult] = await Promise.allSettled([
    loadOrders(start, end),
    loadPayouts(start, end),
    loadShopifySubscriptions(start, end),
    loadDisputes(start, end),
  ]);
  const exceptions: FinanceException[] = [];
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const payoutData = payoutsResult.status === "fulfilled" ? payoutsResult.value : { payouts: [], state: "unavailable" as FinanceSourceState, message: "Shopify payouts unavailable" };
  const shopifySubscriptionData = shopifySubscriptionsResult.status === "fulfilled"
    ? shopifySubscriptionsResult.value
    : { subscriptions: [], connected: false, message: "Shopify app subscriptions unavailable" };
  const disputeData = disputesResult.status === "fulfilled"
    ? disputesResult.value
    : { byOrderId: new Map<string, ShopifyDispute[]>(), disputes: [], state: "unavailable" as FinanceSourceState, message: "Shopify disputes unavailable" };
  const reportOrders = orders.filter((order) => isDateInPeriod(order.createdAt, start, end));
  const campaignData = ordersResult.status === "fulfilled"
    ? await loadCampaignCosts(reportOrders, start, end)
    : { campaigns: [], allocationsByOrderId: new Map<string, number>(), state: "unavailable" as FinanceSourceState, message: "Shopify marketing activity unavailable" };
  const subscriptions = shopifySubscriptionData.subscriptions;

  const addException = (item: FinanceException) => exceptions.push(item);
  if (ordersResult.status === "rejected") addException(exception("shopify-orders", ordersResult.reason?.message || "Shopify orders unavailable", 1, "high"));
  if (payoutData.message && payoutData.state !== "connected") addException(exception("shopify-payouts", payoutData.message, 1, "high"));
  if (shopifySubscriptionData.message) addException(exception("shopify-subscriptions", shopifySubscriptionData.message, 1, "medium"));
  if (shopifySubscriptionData.connected && !subscriptions.length) {
    addException(exception("subscriptions", "Shopify app billing returned no active subscriptions. Shopify plan and external vendor billing are not exposed through this Admin API connection.", 1, "medium"));
  }
  if (disputeData.message) addException(exception("shopify-disputes", disputeData.message, 1, disputeData.state === "unavailable" ? "high" : "medium"));
  const pendingChargebackDisputes = disputeData.disputes.filter(isPendingChargeback);
  const pendingChargebackCents = pendingChargebackDisputes.reduce((sum, dispute) => sum + simpleMoneyCents(dispute.amount), 0);
  if (pendingChargebackCents) {
    addException(exception(
      "shopify-disputes",
      `${formatMoneyText(pendingChargebackCents, "USD")} across ${pendingChargebackDisputes.length} Shopify chargeback dispute${pendingChargebackDisputes.length === 1 ? " remains" : "s remain"} under review. Realized profit excludes this unresolved exposure; the conservative profit view deducts it for planning.`,
      pendingChargebackDisputes.length,
      "medium",
    ));
  }
  if (campaignData.message && campaignData.state !== "connected") {
    addException(exception("campaign-costs", campaignData.message, 1, campaignData.state === "unavailable" ? "high" : "medium"));
  }

  const normalized = normalizeOrders(orders, disputeData.byOrderId, start, end);
  if (normalized.missingCostCount) {
    const message = "Some line items do not have a DSers-synced Shopify inventory cost-per-item value. The unresolved items remain excluded from cost totals until Shopify supplies a cost.";
    const affected = normalized.missingCostLabels.slice(0, 6).join("; ");
    const more = normalized.missingCostLabels.length > 6 ? `; +${normalized.missingCostLabels.length - 6} more` : "";
    addException(exception("missing-cost", `${message} Affected: ${affected}${more}`, normalized.missingCostCount, "high"));
  }
  if (normalized.multiCurrency) addException(exception("currency", "The selected period contains multiple currencies. Totals are not converted.", 1, "high"));

  const currency = normalized.currency || DEFAULT_CURRENCY;
  const effectiveCampaignData = applyEffectiveCampaignCosts(normalized.rows, campaignData, currency);
  const grossSalesCents = normalized.rows.reduce((sum, row) => sum + row.grossSalesCents, 0);
  const discountsCents = normalized.rows.reduce((sum, row) => sum + row.discountsCents, 0);
  const refundsCents = normalized.nonCancelledPeriodRefundsCents;
  const returnDeductionsCents = normalized.returnDeductionsCents;
  const productSalesCents = normalized.rows.reduce((sum, row) => sum + row.netRevenueCents - row.shippingIncomeCents + row.returnDeductionsCents, 0);
  // Refunds issued during the period can belong to orders created earlier.
  // Subtract all non-cancelled period returns from product sales, while
  // keeping cancelled-order cash visible but out of accrual net sales.
  const netSalesCents = productSalesCents - returnDeductionsCents;
  const shippingIncomeCents = normalized.rows.reduce((sum, row) => sum + row.shippingIncomeCents, 0);
  const taxCollectedCents = normalized.rows.reduce((sum, row) => sum + row.taxCollectedCents, 0);
  const cogsCents = normalized.rows.reduce((sum, row) => sum + row.cogsCents, 0);
  const paymentFeesCents = payoutData.payouts.reduce((sum, payout) => sum + payout.feeCents, 0);
  const chargebacksCents = disputeData.disputes.reduce((sum, dispute) => sum + (isChargebackLoss(dispute) ? simpleMoneyCents(dispute.amount) : 0), 0);
  const campaignCostsCents = effectiveCampaignData.campaigns.reduce((sum, campaign) => sum + campaign.allocatedCents, 0);
  const subscriptionCostsCents = subscriptions.reduce((sum, subscription) => sum + subscription.allocatedCents, 0);
  const payoutsReceivedCents = payoutData.payouts.reduce((sum, payout) => sum + (isPaidPayout(payout.status) ? payout.netCents : 0), 0);
  const grossProfitCents = netSalesCents + shippingIncomeCents - cogsCents;
  const operatingProfitCents = grossProfitCents - paymentFeesCents - chargebacksCents - campaignCostsCents - subscriptionCostsCents;
  const conservativeOperatingProfitCents = operatingProfitCents - pendingChargebackCents;
  const reconciliationData = buildAutomaticReconciliation(payoutData, cogsCents, campaignCostsCents, subscriptionCostsCents);
  const totalItems = normalized.rows.reduce((sum, row) => sum + row.itemCount, 0);
  const coveredItems = normalized.rows.reduce((sum, row) => sum + row.coveredItemCount, 0);
  const feeRatio = netSalesCents + shippingIncomeCents ? paymentFeesCents / (netSalesCents + shippingIncomeCents) : 0;
  const cancelledOrdersCount = reportOrders.filter((order) => Boolean(order.cancelledAt)).length;
  const disputedOrdersCount = new Set(
    disputeData.disputes.map((dispute) => String(dispute.order?.id || dispute.order?.name || dispute.id || "unknown")),
  ).size;

  const orderRows: FinanceOrderRow[] = normalized.rows.slice(-200).reverse().map((row) => {
    const allocatedFeesCents = Math.round(row.netRevenueCents * feeRatio);
    const campaignCostCents = effectiveCampaignData.allocationsByOrderId.get(row.id) || 0;
    const profitCents = row.netRevenueCents - row.cogsCents - allocatedFeesCents - row.chargebackCents - campaignCostCents;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      status: row.status,
      grossSalesCents: row.grossSalesCents,
      discountsCents: row.discountsCents,
      refundsCents: row.refundsCents,
      netRevenueCents: row.netRevenueCents,
      cogsCents: row.cogsCents,
      allocatedFeesCents,
      campaignCostCents,
      profitCents,
      marginPercent: percent(profitCents, row.netRevenueCents),
      currency: row.currency,
      itemCount: row.itemCount,
      costCoverage: row.hasMissingCost ? (row.hasCost ? "partial" : "missing") : "complete",
      disputeCount: row.disputeCount,
      campaignKey: row.campaignKey,
    };
  });

  const subscriptionState: FinanceSourceState = shopifySubscriptionData.connected
    ? subscriptions.length ? "connected" : "missing"
    : "unavailable";
  const dsersState: FinanceSourceState = totalItems === 0
    ? "missing"
    : normalized.missingCostCount
      ? "partial"
      : "connected";
  const summary: FinanceSummary = {
    authenticated: true,
    generatedAt: new Date().toISOString(),
    currency,
    period: { start, end, timezone: DEFAULT_TIMEZONE },
    sources: {
      shopify: ordersResult.status === "fulfilled" ? "connected" : "unavailable",
      payouts: payoutData.state,
      dsers: dsersState,
      subscriptions: subscriptionState,
      campaigns: effectiveCampaignData.state,
      reconciliation: reconciliationData.state,
      messages: [
        normalized.missingCostCount
          ? `DSers product-cost coverage is partial: ${normalized.missingCostCount} ordered item${normalized.missingCostCount === 1 ? "" : "s"} still need a cost value in Shopify.`
          : "DSers product cost is read from Shopify inventory cost-per-item values synced into Shopify.",
        payoutData.state === "connected"
          ? "Live Shopify payouts are connected; payment fees are allocated to order rows by net revenue."
          : "Shopify payout data is waiting for merchant-approved Payments access and will retry automatically.",
        subscriptions.length
          ? "Shopify Grow and DSers recurring charges were verified in Shopify Admin and allocated automatically by calendar month."
          : "Shopify app billing returned no active subscriptions; Shopify plan and external vendor charges are not exposed through this connection.",
        disputeData.state === "connected"
          ? disputeData.disputes.length
            ? `${disputeData.disputes.length} Shopify dispute${disputeData.disputes.length === 1 ? " was" : "s were"} reviewed; realized profit deducts only lost, accepted, or expired chargebacks.${pendingChargebackCents ? ` ${formatMoneyText(pendingChargebackCents, "USD")} remains under review; the conservative profit view includes this exposure.` : ""}`
            : "No Shopify disputes were initiated in the selected period."
          : "Shopify dispute data is unavailable, so chargeback deductions cannot be fully verified.",
        normalized.periodRefundsCents
          ? `Shopify recorded ${formatMoneyText(normalized.periodRefundsCents, currency)} in cash refund events created during the selected period. The selected order-period P&L applies ${formatMoneyText(returnDeductionsCents, currency)} of product return deductions;${normalized.updatedOrderRefundsCents ? ` ${formatMoneyText(normalized.updatedOrderRefundsCents, currency)} belongs to older orders and remains reconciliation-only,` : ""} while line-item returns are read from Shopify and payment-only refunds are capped at the order product subtotal.${normalized.cancelledOrderRefundsCents ? ` ${formatMoneyText(normalized.cancelledOrderRefundsCents, currency)} belongs to report-period cancelled orders and is excluded from accrual net sales.` : ""}`
          : "No Shopify refund events were created during the selected period.",
        effectiveCampaignData.message || "Campaign cost allocation is not available yet.",
        reconciliationData.message || "Live reconciliation is not available yet.",
      ],
    },
    kpis: {
      grossSalesCents,
      discountsCents,
      refundsCents,
      returnDeductionsCents,
      periodRefundsCents: normalized.periodRefundsCents,
      cancelledOrderRefundsCents: normalized.cancelledOrderRefundsCents,
      netSalesCents,
      shippingIncomeCents,
      taxCollectedCents,
      cogsCents,
      paymentFeesCents,
      chargebacksCents,
      pendingChargebackCents,
      campaignCostsCents,
      subscriptionCostsCents,
      payoutsReceivedCents,
      grossProfitCents,
      operatingProfitCents,
      conservativeOperatingProfitCents,
      marginPercent: percent(operatingProfitCents, netSalesCents + shippingIncomeCents),
      orderCount: normalized.rows.length,
      cancelledOrdersCount,
      disputedOrdersCount,
      costCoveragePercent: totalItems ? Math.round((coveredItems / totalItems) * 1000) / 10 : null,
    },
    pnlRows: [
      { label: "Gross sales", cents: grossSalesCents, tone: "positive", detail: "Product revenue before discounts" },
      { label: "Discounts", cents: -discountsCents, tone: "negative", detail: "Promotions and order discounts" },
      { label: "Refunds and returns", cents: -returnDeductionsCents, tone: "negative", detail: "Product return deductions; cash refund events remain visible in reconciliation" },
      { label: "Net sales", cents: netSalesCents, tone: "positive", detail: "Product revenue after discounts and refunds" },
      { label: "Shipping income", cents: shippingIncomeCents, tone: "positive", detail: "Shipping charged to customers" },
      { label: "DSers product cost", cents: -cogsCents, tone: "negative", detail: normalized.missingCostCount ? `DSers-synced Shopify cost; ${normalized.missingCostCount} item costs remain unresolved` : "DSers-synced Shopify inventory cost-per-item values" },
      { label: "Payment fees", cents: -paymentFeesCents, tone: "negative", detail: "Fees reported through Shopify payouts" },
      { label: "Chargebacks", cents: -chargebacksCents, tone: "negative", detail: "Lost, accepted, or expired Shopify chargebacks only" },
      { label: "Chargebacks under review", cents: -pendingChargebackCents, tone: "muted", detail: "Conservative exposure only; not a realized loss until Shopify changes the dispute status" },
      { label: "Campaign cost per order", cents: -campaignCostsCents, tone: "negative", detail: "Shopify paid spend where returned; otherwise the configured campaign cost per order" },
      { label: "Subscriptions and software", cents: -subscriptionCostsCents, tone: "negative", detail: "Shopify Grow and DSers Admin-verified recurring charges allocated by calendar month" },
      { label: "Operating profit", cents: operatingProfitCents, tone: operatingProfitCents >= 0 ? "positive" : "negative", detail: "Net sales plus shipping less cost, fees, and subscriptions" },
      { label: "Operating profit (conservative)", cents: conservativeOperatingProfitCents, tone: conservativeOperatingProfitCents >= 0 ? "positive" : "negative", detail: "Realized operating profit less chargebacks still under review" },
    ],
    reconciliation: reconciliationData.summary,
    payouts: payoutData.payouts,
    subscriptions,
    campaignCosts: effectiveCampaignData.campaigns,
    orders: orderRows,
    exceptions: consolidateExceptions(exceptions),
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
