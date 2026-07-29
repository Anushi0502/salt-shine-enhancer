import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  FinanceException,
  FinanceCampaignSpend,
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
  sourceType?: string | null;
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
  status?: string;
  initiatedAs?: string;
};

type ShopifyMarketingActivity = {
  id?: string;
  title?: string;
  status?: string;
  sourceAndMedium?: string | null;
  utmParameters?: ShopifyUtmParameters | null;
  adSpend?: ShopifyMoney | null;
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
  customerJourneySummary?: ShopifyCustomerJourneySummary | null;
  disputes?: {
    nodes?: ShopifyDispute[];
  } | null;
  lineItems?: {
    nodes?: Array<{
      quantity?: number;
      title?: string;
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

type SupplierCostSource = {
  costs: Map<string, number>;
  configured: boolean;
  message?: string;
};

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

type NormalizedOrder = {
  id: string;
  name: string;
  createdAt: string;
  status: "open" | "cancelled" | "disputed" | "cancelled-disputed";
  currency: string;
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  netRevenueCents: number;
  taxCollectedCents: number;
  shippingIncomeCents: number;
  cogsCents: number;
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
            marketingEvent { utmSource utmMedium utmCampaign sourceType }
          }
          lastVisit {
            utmParameters { source medium campaign content term }
            marketingEvent { utmSource utmMedium utmCampaign sourceType }
          }
        }
        disputes(first: 20) {
          nodes {
            id
            status
            initiatedAs
          }
        }
        lineItems(first: 100) {
          nodes {
            quantity
            title
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

function extractCampaignAttributionFromValues(source: string, medium: string, campaign: string): { key: string; source: string; medium: string; campaign: string; title: string } | null {
  const normalizedSource = normalizeCampaignPart(source);
  const normalizedMedium = normalizeCampaignPart(medium);
  const normalizedCampaign = normalizeCampaignPart(campaign);
  if (!normalizedSource && !normalizedMedium && !normalizedCampaign) return null;
  return {
    key: campaignKey(normalizedSource, normalizedMedium, normalizedCampaign),
    source: normalizedSource,
    medium: normalizedMedium,
    campaign: normalizedCampaign,
    title: normalizedCampaign || normalizedSource || normalizedMedium || "Attributed campaign",
  };
}

async function loadCampaignCosts(orders: ShopifyOrder[]): Promise<CampaignSpendSource> {
  if (!shopifyHeaders()["X-Shopify-Access-Token"]) {
    return {
      campaigns: [],
      allocationsByOrderId: new Map(),
      state: "unavailable",
      message: "Shopify Admin credentials are not configured",
    };
  }

  const groups = new Map<string, { source: string; medium: string; campaign: string; title: string; orderIds: string[]; orderRows: Array<{ id: string; createdAt: string }> }>();
  for (const order of orders) {
    const attribution = extractCampaignAttribution(order);
    if (!attribution) continue;
    const existing = groups.get(attribution.key);
    if (existing) {
      existing.orderIds.push(String(order.id || order.name || "unknown"));
      existing.orderRows.push({ id: String(order.id || order.name || "unknown"), createdAt: String(order.createdAt || "") });
    } else {
      groups.set(attribution.key, {
        source: attribution.source,
        medium: attribution.medium,
        campaign: attribution.campaign,
        title: attribution.title,
        orderIds: [String(order.id || order.name || "unknown")],
        orderRows: [{ id: String(order.id || order.name || "unknown"), createdAt: String(order.createdAt || "") }],
      });
    }
  }

  if (!groups.size) {
    return {
      campaigns: [],
      allocationsByOrderId: new Map(),
      state: "missing",
      message: "No Shopify marketing attribution data was available on the selected orders.",
    };
  }

  const allocationsByOrderId = new Map<string, number>();
  const campaigns: FinanceCampaignSpend[] = [];
  const errors: string[] = [];
  let resolvedGroups = 0;

  const uniqueGroups = [...groups.values()];
  const results = await Promise.allSettled(uniqueGroups.map(async (group) => {
    const utm: Record<string, string> = {};
    if (group.source) utm.source = group.source;
    if (group.medium) utm.medium = group.medium;
    if (group.campaign) utm.campaign = group.campaign;

    const data = await queryShopify(MARKETING_ACTIVITY_QUERY, { utm });
    const activities = (data?.marketingActivities?.nodes || []) as Array<Record<string, any>>;
    const adSpendCents = activities.reduce((sum, activity) => sum + simpleMoneyCents(activity.adSpend), 0);
    const orderRows = [...group.orderRows].sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.id.localeCompare(right.id);
    });
    const count = orderRows.length;
    const allocations = count
      ? orderRows.map((row, index) => Math.floor(adSpendCents / count) + (index < adSpendCents % count ? 1 : 0))
      : [];

    orderRows.forEach((row, index) => {
      const current = allocationsByOrderId.get(row.id) || 0;
      allocationsByOrderId.set(row.id, current + (allocations[index] || 0));
    });

    campaigns.push({
      key: campaignKey(group.source, group.medium, group.campaign),
      title: group.title,
      source: group.source || "unknown",
      medium: group.medium || "unknown",
      campaign: group.campaign || "unknown",
      adSpendCents,
      allocatedCents: allocations.reduce((sum, value) => sum + value, 0),
      currency: String(activities[0]?.adSpend?.currencyCode || DEFAULT_CURRENCY),
      orderCount: count,
    });

    resolvedGroups += 1;
  }));

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : "Shopify marketing activities unavailable");
    }
  }

  if (!resolvedGroups) {
    return {
      campaigns: [],
      allocationsByOrderId: new Map(),
      state: "unavailable",
      message: errors[0] || "Shopify marketing activity access is unavailable. Merchant approval for read_marketing_events is required.",
    };
  }

  const hasPartialAllocation = [...orders].some((order) => extractCampaignAttribution(order) && !allocationsByOrderId.has(String(order.id || order.name || "unknown")));
  const hasErrors = errors.length > 0;
  const partialMessage = hasPartialAllocation
    ? "Some Shopify marketing activities were not fully matched to attributed orders and were left out of the campaign allocation."
    : undefined;
  return {
    campaigns: campaigns.sort((left, right) => right.allocatedCents - left.allocatedCents || left.title.localeCompare(right.title)),
    allocationsByOrderId,
    state: hasErrors || hasPartialAllocation ? "partial" : "connected",
    message: hasErrors
      ? [errors.join(" | "), partialMessage].filter(Boolean).join(" | ")
      : partialMessage,
  };
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
  return "Shopify payouts need merchant-approved Payments API access; add FINANCE_PAYOUTS_JSON until access is granted.";
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

function parseManualPayouts(start: string, end: string): { payouts: FinancePayout[]; state: FinanceSourceState; message?: string } {
  const raw = String(process.env.FINANCE_PAYOUTS_JSON || "").trim();
  if (!raw) return { payouts: [], state: "missing" };

  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed) ? parsed : (parsed as { payouts?: unknown })?.payouts;
    if (!Array.isArray(entries)) throw new Error("expected an array of payout records");

    const startTime = new Date(`${start}T00:00:00Z`).getTime();
    const endTime = new Date(`${end}T23:59:59Z`).getTime();
    const payouts = entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      const issuedAt = String(value.issuedAt || value.issued_at || value.date || "");
      const issuedTime = issuedAt ? new Date(issuedAt).getTime() : NaN;
      if (Number.isFinite(issuedTime) && (issuedTime < startTime || issuedTime > endTime)) return [];
      const amountCents = value.amountCents == null ? cents(value.amount) : Number(value.amountCents);
      const feeCents = value.feeCents == null ? cents(value.fee) : Number(value.feeCents);
      const netCents = value.netCents == null ? (value.net == null ? amountCents - feeCents : cents(value.net)) : Number(value.netCents);
      if (![amountCents, feeCents, netCents].every(Number.isFinite)) return [];
      return [{
        id: String(value.id || value.externalTraceId || value.external_trace_id || "manual-payout"),
        issuedAt,
        status: String(value.status || "paid").toLowerCase(),
        type: String(value.type || "deposit").toLowerCase(),
        amountCents: Math.round(amountCents),
        feeCents: Math.round(feeCents),
        netCents: Math.round(netCents),
        currency: String(value.currency || DEFAULT_CURRENCY),
      } satisfies FinancePayout];
    });

    return { payouts, state: "manual" };
  } catch (error) {
    return { payouts: [], state: "unavailable", message: `FINANCE_PAYOUTS_JSON is invalid: ${error instanceof Error ? error.message : "expected payout records"}` };
  }
}

async function loadPayouts(start: string, end: string): Promise<{ payouts: FinancePayout[]; state: FinanceSourceState; message?: string }> {
  const manual = parseManualPayouts(start, end);
  if (!shopifyHeaders()["X-Shopify-Access-Token"]) {
    return manual.state === "manual" && manual.payouts.length
      ? manual
      : { payouts: [], state: "unavailable", message: "Shopify Admin credentials are not configured" };
  }

  let graphqlError = "";
  try {
    const data = await queryShopify(PAYOUT_QUERY, { query: payoutDateQuery(start, end) });
    const account = data?.shopifyPaymentsAccount;
    if (!account) throw new Error("Shopify Payments account is not available for this store");
    return { payouts: normalizeGraphqlPayouts(account.payouts?.nodes || []), state: "connected" };
  } catch (error) {
    graphqlError = error instanceof Error ? error.message : "Shopify Payments GraphQL unavailable";
    if (isShopifyPaymentsAccessError(graphqlError)) {
      if (manual.state === "manual" && manual.payouts.length) return manual;
      return { payouts: [], state: "partial", message: shopifyPayoutsAccessMessage() };
    }
  }

  let restError = "";
  try {
    const url = new URL(adminApiUrl("/shopify_payments/payouts.json"));
    url.searchParams.set("date_min", `${start}T00:00:00Z`);
    url.searchParams.set("date_max", `${end}T23:59:59Z`);
    url.searchParams.set("limit", "250");
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
    restError = error instanceof Error ? error.message : "Shopify payouts unavailable";
    if (isShopifyPaymentsAccessError(restError)) {
      if (manual.state === "manual" && manual.payouts.length) return manual;
      return { payouts: [], state: "partial", message: shopifyPayoutsAccessMessage() };
    }
  }

  if (manual.state === "manual" && manual.payouts.length) return manual;
  if (manual.message) return { payouts: [], state: "unavailable", message: manual.message };

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

function parseSupplierCosts(): SupplierCostSource {
  const raw = String(process.env.FINANCE_DSER_COSTS_JSON || "").trim();
  if (!raw) return { costs: new Map(), configured: false };

  try {
    const parsed = JSON.parse(raw) as unknown;
    const costs = new Map<string, number>();
    const add = (key: unknown, value: unknown) => {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) return;
      const amountCents = typeof value === "object" && value !== null
        ? ((value as Record<string, unknown>).amountCents == null
          ? cents((value as Record<string, unknown>).amount ?? (value as Record<string, unknown>).cost)
          : Number((value as Record<string, unknown>).amountCents))
        : cents(value);
      if (Number.isFinite(amountCents) && amountCents >= 0) costs.set(normalizedKey, Math.round(amountCents));
    };

    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const value = entry as Record<string, unknown>;
        const amount = value.amountCents == null
          ? (value.amount ?? value.cost ?? value.costPerItem)
          : { amountCents: value.amountCents };
        for (const key of [value.variantId, value.variant_id, value.id, value.sku]) add(key, amount);
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) add(key, value);
    } else {
      throw new Error("expected an object or array");
    }

    return { costs, configured: true };
  } catch (error) {
    return { costs: new Map(), configured: true, message: `FINANCE_DSER_COSTS_JSON is invalid: ${error instanceof Error ? error.message : "expected cost records"}` };
  }
}

function normalizeOrders(orders: ShopifyOrder[], supplierCosts: SupplierCostSource): { rows: NormalizedOrder[]; currency: string; missingCostCount: number; coveredBySupplierCount: number; multiCurrency: boolean } {
  const currencies = new Set<string>();
  let missingCostCount = 0;
  let coveredBySupplierCount = 0;
  const rows = orders.map((order) => {
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
    const disputes = order.disputes?.nodes || [];
    const disputeCount = disputes.length;
    const cancelled = Boolean(order.cancelledAt);
    const status: NormalizedOrder["status"] = cancelled
      ? (disputeCount ? "cancelled-disputed" : "cancelled")
      : disputeCount
        ? "disputed"
        : "open";
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
      const variantId = String(line.variant?.id || "").trim();
      const numericVariantId = variantId.split("/").pop() || variantId;
      const sku = String(line.variant?.sku || "").trim();
      const supplierCostCents = supplierCosts.costs.get(variantId) ?? supplierCosts.costs.get(numericVariantId) ?? supplierCosts.costs.get(sku);
      const unitCostCents = unitCost?.amount != null ? cents(unitCost.amount) : supplierCostCents;
      if (unitCostCents != null) {
        cogsCents += unitCostCents * quantity;
        hasCost = true;
        coveredItemCount += quantity;
        if (unitCost?.amount == null) coveredBySupplierCount += quantity;
      } else {
        hasMissingCost = true;
        missingCostCount += quantity;
      }
    }

    return {
      id: String(order.id || order.name || "unknown"),
      name: String(order.name || order.id || "Order"),
      createdAt: String(order.createdAt || ""),
      status,
      currency,
      grossSalesCents,
      discountsCents,
      refundsCents,
      netRevenueCents,
      taxCollectedCents: moneyCents(order.totalTaxSet),
      shippingIncomeCents: moneyCents(order.totalShippingPriceSet),
      cogsCents,
      campaignKey: campaign?.key || null,
      disputeCount,
      itemCount,
      coveredItemCount,
      hasCost,
      hasMissingCost,
    } satisfies NormalizedOrder;
  });

  return {
    rows,
    currency: currencies.values().next().value || DEFAULT_CURRENCY,
    missingCostCount,
    coveredBySupplierCount,
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

async function loadShopifySubscriptions(start: string, end: string): Promise<SubscriptionSource> {
  if (!shopifyHeaders()["X-Shopify-Access-Token"]) {
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
    return { subscriptions, connected: true };
  } catch (error) {
    return { subscriptions: [], connected: false, message: error instanceof Error ? error.message : "Shopify app subscriptions unavailable" };
  }
}

function parseManualCosts(start: string, end: string): { subscriptions: FinanceSubscription[]; state: FinanceSourceState; message?: string } {
  const raw = String(process.env.FINANCE_SUBSCRIPTIONS_JSON || "").trim();
  if (!raw) return { subscriptions: [], state: "missing" };

  try {
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
    const days = periodDays(start, end);
    const subscriptions = entries.flatMap((entry) => {
      if (entry.active === false) return [];
      const amountCents = entry.amountCents == null ? cents(entry.amount) : Number(entry.amountCents);
      if (!Number.isFinite(amountCents) || amountCents <= 0) return [];
      const interval = String(entry.interval || "monthly").toLowerCase();
      const multiplier = interval === "one-time" ? 1 : recurringMultiplier(interval, days);
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

  const [ordersResult, payoutsResult, shopifySubscriptionsResult] = await Promise.allSettled([
    loadOrders(start, end),
    loadPayouts(start, end),
    loadShopifySubscriptions(start, end),
  ]);
  const supplierCosts = parseSupplierCosts();
  const manualCosts = parseManualCosts(start, end);
  const exceptions: FinanceException[] = [];
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const payoutData = payoutsResult.status === "fulfilled" ? payoutsResult.value : { payouts: [], state: "unavailable" as FinanceSourceState, message: "Shopify payouts unavailable" };
  const shopifySubscriptionData = shopifySubscriptionsResult.status === "fulfilled"
    ? shopifySubscriptionsResult.value
    : { subscriptions: [], connected: false, message: "Shopify app subscriptions unavailable" };
  const campaignData = ordersResult.status === "fulfilled"
    ? await loadCampaignCosts(orders)
    : { campaigns: [], allocationsByOrderId: new Map<string, number>(), state: "unavailable" as FinanceSourceState, message: "Shopify marketing activity unavailable" };
  const subscriptions = [...shopifySubscriptionData.subscriptions, ...manualCosts.subscriptions];

  if (ordersResult.status === "rejected") exceptions.push(exception("shopify-orders", ordersResult.reason?.message || "Shopify orders unavailable", 1, "high"));
  if (payoutData.message && payoutData.state === "unavailable") exceptions.push(exception("shopify-payouts", payoutData.message, 1, "high"));
  if (supplierCosts.message) exceptions.push(exception("dsers-costs", supplierCosts.message, 1, "high"));
  if (shopifySubscriptionData.message) exceptions.push(exception("shopify-subscriptions", shopifySubscriptionData.message, 1, "medium"));
  if (manualCosts.message) exceptions.push(exception("subscriptions", manualCosts.message, 1, "medium"));
  if (campaignData.message) exceptions.push(exception("campaign-costs", campaignData.message, 1, campaignData.state === "unavailable" ? "high" : "medium"));

  const normalized = normalizeOrders(orders, supplierCosts);
  if (normalized.missingCostCount) {
    const message = supplierCosts.configured
      ? "Some line items still do not have a Shopify or DSers supplier cost after applying the configured DSers cost map."
      : "Some line items do not have a Shopify/DSers cost-per-item value. Add FINANCE_DSER_COSTS_JSON or populate Shopify cost per item.";
    exceptions.push(exception("missing-cost", message, normalized.missingCostCount, "high"));
  }
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
  const campaignCostsCents = campaignData.campaigns.reduce((sum, campaign) => sum + campaign.allocatedCents, 0);
  const subscriptionCostsCents = subscriptions.reduce((sum, subscription) => sum + subscription.allocatedCents, 0);
  const payoutsReceivedCents = payoutData.payouts.reduce((sum, payout) => sum + payout.netCents, 0);
  const grossProfitCents = netSalesCents + shippingIncomeCents - cogsCents;
  const operatingProfitCents = grossProfitCents - paymentFeesCents - campaignCostsCents - subscriptionCostsCents;
  const totalItems = normalized.rows.reduce((sum, row) => sum + row.itemCount, 0);
  const coveredItems = normalized.rows.reduce((sum, row) => sum + row.coveredItemCount, 0);
  const feeRatio = netSalesCents + shippingIncomeCents ? paymentFeesCents / (netSalesCents + shippingIncomeCents) : 0;

  const orderRows: FinanceOrderRow[] = normalized.rows.slice(-200).reverse().map((row) => {
    const allocatedFeesCents = Math.round(row.netRevenueCents * feeRatio);
    const campaignCostCents = campaignData.allocationsByOrderId.get(row.id) || 0;
    const profitCents = row.netRevenueCents - row.cogsCents - allocatedFeesCents - campaignCostCents;
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
    ? "connected"
    : manualCosts.state === "manual"
      ? "manual"
      : "unavailable";
  const campaignState: FinanceSourceState = campaignData.state;
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
      campaigns: campaignState,
      messages: [
        normalized.coveredBySupplierCount
          ? `DSers cost map covered ${normalized.coveredBySupplierCount} ordered item${normalized.coveredBySupplierCount === 1 ? "" : "s"}.`
          : "DSers costs use Shopify variant cost-per-item values. External supplier costs can be supplied through FINANCE_DSER_COSTS_JSON.",
        payoutData.state === "connected"
          ? "Shopify payouts are live and payment fees are allocated to order rows by net revenue."
          : "Shopify payouts require merchant-approved payments access; FINANCE_PAYOUTS_JSON is supported for reconciled exports until access is granted.",
        shopifySubscriptionData.connected
          ? "Active SALT app subscriptions are pulled from Shopify billing automatically; DSers and other vendor subscriptions can be added through FINANCE_SUBSCRIPTIONS_JSON."
          : "External vendor subscriptions require FINANCE_SUBSCRIPTIONS_JSON until their billing data is available to this app.",
        campaignData.state === "connected"
          ? `${campaignData.campaigns.length} Shopify marketing campaign${campaignData.campaigns.length === 1 ? "" : "s"} were matched and allocated to the attributed orders, including cancelled and disputed orders when they carry attribution.`
          : campaignData.state === "partial"
            ? "Shopify marketing campaign spend was partially matched to attributed orders; any missing activity is tracked as a reconciliation exception."
            : "Shopify marketing campaign spend requires read_marketing_events access or a campaign-cost override to allocate each order.",
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
      campaignCostsCents,
      subscriptionCostsCents,
      payoutsReceivedCents,
      grossProfitCents,
      operatingProfitCents,
      marginPercent: percent(operatingProfitCents, netSalesCents + shippingIncomeCents),
      orderCount: normalized.rows.length,
      cancelledOrdersCount: normalized.rows.filter((row) => row.status === "cancelled" || row.status === "cancelled-disputed").length,
      disputedOrdersCount: normalized.rows.filter((row) => row.status === "disputed" || row.status === "cancelled-disputed").length,
      costCoveragePercent: totalItems ? Math.round((coveredItems / totalItems) * 1000) / 10 : null,
    },
    pnlRows: [
      { label: "Gross sales", cents: grossSalesCents, tone: "positive", detail: "Product revenue before discounts" },
      { label: "Discounts", cents: -discountsCents, tone: "negative", detail: "Promotions and order discounts" },
      { label: "Refunds and returns", cents: -refundsCents, tone: "negative", detail: "Difference between original and current order totals" },
      { label: "Net sales", cents: netSalesCents, tone: "positive", detail: "Product revenue after discounts and refunds" },
      { label: "Shipping income", cents: shippingIncomeCents, tone: "positive", detail: "Shipping charged to customers" },
      { label: "Supplier and product cost", cents: -cogsCents, tone: "negative", detail: "Shopify inventory cost plus matched DSers supplier cost map" },
      { label: "Payment fees", cents: -paymentFeesCents, tone: "negative", detail: "Fees reported through Shopify payouts" },
      { label: "Campaign spend", cents: -campaignCostsCents, tone: "negative", detail: "Shopify marketing activity ad spend allocated to attributed orders" },
      { label: "Subscriptions and software", cents: -subscriptionCostsCents, tone: "negative", detail: "Shopify app billing plus configured external recurring costs" },
      { label: "Operating profit", cents: operatingProfitCents, tone: operatingProfitCents >= 0 ? "positive" : "negative", detail: "Net sales plus shipping less cost, fees, campaign spend, and subscriptions" },
    ],
    payouts: payoutData.payouts,
    subscriptions,
    campaignCosts: campaignData.campaigns,
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
