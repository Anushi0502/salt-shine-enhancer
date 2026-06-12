import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";
import { buildLiveShopifyBaseCandidates } from "@/lib/shopify-live-bases";
import { isNativeApp } from "@/lib/mobile";

const CUSTOMER_ACCOUNT_STORAGE_KEY = "salt-shopify-customer-account-v1";
const CUSTOMER_ACCOUNT_SESSION_KEY = "salt-shopify-customer-account-session-v1";
const CUSTOMER_ACCOUNT_DISCOVERY_CACHE_KEY = "salt-shopify-customer-account-discovery-v1";
const DEFAULT_SCOPE = "openid email customer-account-api:full";
const DEFAULT_REDIRECT_PATH = "/account/authorize";
const DEFAULT_REGION_COUNTRY = "US";
const DEFAULT_LOCALE = "en";
const DISCOVERY_TIMEOUT_MS = 7_500;
const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ORDERS_PAGE_SIZE = 24;

export type ShopifyCustomerAccountDiscovery = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  graphqlEndpoint: string;
  logoutEndpoint?: string;
  shopBaseUrl: string;
};

export type ShopifyCustomerAccountAuthRequest = {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  returnTo: string;
  loginHint?: string;
  redirectUri: string;
  shopBaseUrl: string;
  createdAt: number;
};

export type ShopifyCustomerAccountToken = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
};

type ShopifyCustomerAccountLineItem = {
  title: string;
  quantity: number;
  variantTitle: string;
  totalAmount: number;
  totalLabel: string;
  currencyCode: string;
  imageUrl: string;
  imageAlt: string;
};

type ShopifyCustomerAccountOrder = {
  id: string;
  name: string;
  orderNumber: number;
  confirmationNumber: string;
  processedAt: string;
  updatedAt: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  financialStatus: string;
  statusPageUrl: string;
  phone: string;
  totalAmount: number;
  totalLabel: string;
  currencyCode: string;
  lineItems: ShopifyCustomerAccountLineItem[];
};

type ShopifyCustomerAccountCustomer = {
  displayName: string;
  email: string;
  phone: string;
};

export type ShopifyCustomerAccountSummary = {
  customer: ShopifyCustomerAccountCustomer;
  orders: ShopifyCustomerAccountOrder[];
};

type OrderMoney = {
  amount: number;
  label: string;
  currencyCode: string;
};

type ShopifyAccountAuthOptions = {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  loginHint?: string;
  regionCountry?: string;
  locale?: string;
};

type ShopifyCustomerAccountQueryResponse = {
  customer?: Record<string, unknown> | null;
};

type ShopifyCustomerAccountSnapshot = {
  customer?: Record<string, unknown> | null;
  orders?: unknown[] | null;
};

type DiscoveryResponse = {
  authorization_endpoint?: string;
  token_endpoint?: string;
  end_session_endpoint?: string;
};

type CustomerAccountApiDiscoveryResponse = {
  graphql_api?: string;
};

type CachedDiscoveryRecord = {
  discovery: ShopifyCustomerAccountDiscovery;
  cachedAt: number;
};

type DiscoveryCacheStore = Record<string, CachedDiscoveryRecord>;

const discoveryInFlightRequests = new Map<string, Promise<ShopifyCustomerAccountDiscovery | null>>();
const discoveryMemoryCache = new Map<string, CachedDiscoveryRecord>();

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function getWindowBaseUrl(): string {
  if (typeof window === "undefined") {
    return getShopBaseOrigin();
  }

  return window.location.origin;
}

function isLikelyLocalRuntimeHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".lan")
  ) {
    return true;
  }

  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function normalizeBaseUrl(input: string | undefined | null): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function normalizeDiscoveryBaseUrl(input: string | undefined | null): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${pathname && pathname !== "/" ? pathname : ""}`;
  } catch {
    return null;
  }
}

function normalizeDiscoveryCacheKey(input: string | undefined | null): string {
  return normalizeDiscoveryBaseUrl(input)?.replace(/\/+$/, "") || "";
}

function readDiscoveryCacheStore(): DiscoveryCacheStore {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(CUSTOMER_ACCOUNT_DISCOVERY_CACHE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as DiscoveryCacheStore;
  } catch {
    return {};
  }
}

function writeDiscoveryCacheStore(store: DiscoveryCacheStore): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(CUSTOMER_ACCOUNT_DISCOVERY_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota or serialization failures; discovery will fall back to network.
  }
}

function isFreshDiscoveryRecord(record: CachedDiscoveryRecord): boolean {
  return Date.now() - record.cachedAt < DISCOVERY_CACHE_TTL_MS;
}

function readCachedDiscovery(baseUrl: string): ShopifyCustomerAccountDiscovery | null {
  const cacheKey = normalizeDiscoveryCacheKey(baseUrl);
  if (!cacheKey) {
    return null;
  }

  const memoryRecord = discoveryMemoryCache.get(cacheKey);
  if (memoryRecord) {
    if (isFreshDiscoveryRecord(memoryRecord)) {
      return memoryRecord.discovery;
    }

    discoveryMemoryCache.delete(cacheKey);
  }

  const store = readDiscoveryCacheStore();
  const diskRecord = store[cacheKey];
  if (!diskRecord) {
    return null;
  }

  if (!isFreshDiscoveryRecord(diskRecord)) {
    delete store[cacheKey];
    writeDiscoveryCacheStore(store);
    return null;
  }

  discoveryMemoryCache.set(cacheKey, diskRecord);
  return diskRecord.discovery;
}

function persistCachedDiscovery(baseUrl: string, discovery: ShopifyCustomerAccountDiscovery): void {
  const cacheKey = normalizeDiscoveryCacheKey(baseUrl);
  if (!cacheKey) {
    return;
  }

  const record: CachedDiscoveryRecord = {
    discovery,
    cachedAt: Date.now(),
  };

  discoveryMemoryCache.set(cacheKey, record);

  const store = readDiscoveryCacheStore();
  store[cacheKey] = record;
  writeDiscoveryCacheStore(store);
}

export function clearShopifyCustomerAccountDiscoveryCacheForTests(): void {
  discoveryInFlightRequests.clear();
  discoveryMemoryCache.clear();

  const storage = getStorage();
  storage?.removeItem(CUSTOMER_ACCOUNT_DISCOVERY_CACHE_KEY);
}

function getDiscoveryBaseCandidates(): string[] {
  const runtime = getRuntimeContext();
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : null;
  const localHost = typeof window !== "undefined" ? isLikelyLocalRuntimeHost(window.location.hostname) : false;
  const baseOrigin = getShopBaseOrigin();
  const shopDomain =
    normalizeBaseUrl(runtime.shopDomain) ||
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL) ||
    baseOrigin;

  return buildLiveShopifyBaseCandidates({
    browserOrigin,
    shopBaseOrigin: baseOrigin,
    shopApiBase: shopDomain || baseOrigin,
    native: isNativeApp(),
    localHost,
  });
}

async function fetchJson<T>(input: string, init?: RequestInit, timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : typeof Buffer !== "undefined"
        ? Buffer.from(bytes).toString("base64")
        : binary;

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : typeof Buffer !== "undefined"
        ? Buffer.from(padded, "base64").toString("binary")
        : padded;

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatMoney(amount: number, currencyCode: string): string {
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

function parseMoney(value: unknown, fallbackCurrencyCode = "USD"): OrderMoney {
  const money = asRecord(value);
  const amount = money ? asNumber(money.amount ?? money.price ?? money.totalPrice ?? money.value) : asNumber(value);
  const currencyCode = asString(money?.currencyCode || money?.currency || fallbackCurrencyCode) || "USD";

  return {
    amount,
    label: formatMoney(amount, currencyCode),
    currencyCode,
  };
}

function resolveCustomerName(customer: Record<string, unknown> | null): string {
  if (!customer) {
    return "Shopify customer";
  }

  const displayName = asString(customer.displayName);
  if (displayName) {
    return displayName;
  }

  const firstName = asString(customer.firstName || customer.first_name);
  const lastName = asString(customer.lastName || customer.last_name);
  const email = asString(asRecord(customer.emailAddress)?.emailAddress || customer.email);
  const phone = asString(asRecord(customer.phoneNumber)?.phoneNumber || customer.phone);

  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) {
    return combined;
  }

  if (email) {
    return email;
  }

  if (phone) {
    return phone;
  }

  return "Shopify customer";
}

function mapOrderStatusLabel(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    return "Unknown";
  }

  switch (raw.toLowerCase()) {
    case "paid":
      return "Paid";
    case "authorized":
      return "Authorized";
    case "partially_paid":
    case "partially paid":
      return "Partially paid";
    case "pending":
      return "Pending";
    case "voided":
      return "Voided";
    case "refunded":
      return "Refunded";
    case "partially_refunded":
    case "partially refunded":
      return "Partially refunded";
    case "in_progress":
    case "in progress":
      return "In progress";
    case "pending_fulfillment":
    case "pending fulfillment":
      return "Pending fulfillment";
    case "partially_fulfilled":
    case "partially fulfilled":
      return "Partially fulfilled";
    case "fulfilled":
      return "Fulfilled";
    case "on_hold":
    case "on hold":
      return "On hold";
    case "restocked":
      return "Restocked";
    case "scheduled":
      return "Scheduled";
    default:
      return toTitleCase(raw);
  }
}

function mapLineItem(input: Record<string, unknown>): ShopifyCustomerAccountLineItem {
  const image = asRecord(input.image);
  const money = parseMoney(input.totalPrice || input.currentTotalPrice || input.price);

  return {
    title: asString(input.title || input.name),
    quantity: Math.max(1, Math.floor(asNumber(input.quantity) || 1)),
    variantTitle: asString(input.variantTitle || input.presentmentTitle),
    totalAmount: money.amount,
    totalLabel: money.label,
    currencyCode: money.currencyCode,
    imageUrl: asString(image?.url),
    imageAlt: asString(image?.altText || image?.alt_text || image?.alt || input.title || input.name),
  };
}

function mapOrder(input: Record<string, unknown>): ShopifyCustomerAccountOrder | null {
  const id = asString(input.id);
  if (!id) {
    return null;
  }

  const total = parseMoney(input.totalPrice || input.subtotal);
  const lineItemsConnection = asRecord(input.lineItems);
  const edges = Array.isArray(lineItemsConnection?.edges) ? lineItemsConnection?.edges : [];

  return {
    id,
    name: asString(input.name),
    orderNumber: Math.max(0, Math.floor(asNumber(input.number))),
    confirmationNumber: asString(input.confirmationNumber),
    processedAt: asString(input.processedAt),
    updatedAt: asString(input.updatedAt || input.processedAt),
    paymentStatus: mapOrderStatusLabel(input.financialStatus),
    fulfillmentStatus: mapOrderStatusLabel(input.fulfillmentStatus),
    financialStatus: mapOrderStatusLabel(input.financialStatus),
    statusPageUrl: asString(input.statusPageUrl),
    phone: asString(input.phone),
    totalAmount: total.amount,
    totalLabel: total.label,
    currencyCode: total.currencyCode,
    lineItems: edges
      .map((edge) => asRecord(edge)?.node)
      .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"))
      .map(mapLineItem),
  };
}

function toShopifyCustomerAccountSummary(response: ShopifyCustomerAccountQueryResponse): ShopifyCustomerAccountSummary {
  const customerRecord = asRecord(response.customer);
  const emailRecord = asRecord(customerRecord?.emailAddress);
  const phoneRecord = asRecord(customerRecord?.phoneNumber);
  const ordersConnection = asRecord(customerRecord?.orders);
  const orderEdges = Array.isArray(ordersConnection?.edges) ? ordersConnection?.edges : [];

  return {
    customer: {
      displayName: resolveCustomerName(customerRecord),
      email: asString(emailRecord?.emailAddress),
      phone: asString(phoneRecord?.phoneNumber),
    },
    orders: orderEdges
      .map((edge) => asRecord(edge)?.node)
      .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"))
      .map(mapOrder)
      .filter((order): order is ShopifyCustomerAccountOrder => Boolean(order))
      .sort((left, right) => new Date(right.processedAt).getTime() - new Date(left.processedAt).getTime()),
  };
}

function mapLiquidLineItem(input: Record<string, unknown>, currencyCode: string): ShopifyCustomerAccountLineItem {
  const image = asRecord(input.image);
  const quantity = Math.max(1, Math.floor(asNumber(input.quantity) || 1));
  const totalMoney = parseMoney(
    input.final_line_price || input.line_price || input.total_price || input.final_price,
    currencyCode,
  );
  const unitMoney = parseMoney(input.final_price || input.price, currencyCode);
  const totalAmount = totalMoney.amount || Math.max(0, unitMoney.amount) * quantity;

  return {
    title: asString(input.title || input.name),
    quantity,
    variantTitle: asString(
      input.variant_title ||
        input.variantTitle ||
        asRecord(input.variant)?.title ||
        input.presentment_title ||
        input.presentmentTitle,
    ),
    totalAmount,
    totalLabel: formatMoney(totalAmount, totalMoney.currencyCode || currencyCode),
    currencyCode: totalMoney.currencyCode || currencyCode,
    imageUrl: asString(image?.url || image?.src),
    imageAlt: asString(image?.altText || image?.alt_text || image?.alt || input.title || input.name),
  };
}

function mapLiquidOrder(input: Record<string, unknown>): ShopifyCustomerAccountOrder | null {
  const id = asString(input.id || input.customer_order_url || input.customer_url || input.order_status_url);
  if (!id) {
    return null;
  }

  const runtimeCurrency = asString(getRuntimeContext().currency) || "USD";
  const currencyCode =
    asString(input.currency || input.currencyCode || input.presentment_currency || input.presentmentCurrency) ||
    runtimeCurrency;
  const total = parseMoney(input.total_price || input.total_net_amount || input.totalPrice || input.totalPriceSet, currencyCode);
  const lineItems = Array.isArray(input.line_items)
    ? input.line_items
    : Array.isArray(input.lineItems)
      ? input.lineItems
      : [];

  return {
    id,
    name: asString(input.name),
    orderNumber: Math.max(0, Math.floor(asNumber(input.order_number || input.number))),
    confirmationNumber: asString(input.confirmation_number || input.confirmationNumber),
    processedAt: asString(input.processed_at || input.created_at || input.createdAt),
    updatedAt: asString(input.updated_at || input.updatedAt || input.processed_at || input.created_at || input.createdAt),
    paymentStatus: mapOrderStatusLabel(input.financial_status_label || input.financial_status),
    fulfillmentStatus: mapOrderStatusLabel(input.fulfillment_status_label || input.fulfillment_status),
    financialStatus: mapOrderStatusLabel(input.financial_status_label || input.financial_status),
    statusPageUrl: asString(input.customer_order_url || input.customer_url || input.order_status_url),
    phone: asString(input.phone),
    totalAmount: total.amount,
    totalLabel: total.label,
    currencyCode: total.currencyCode || currencyCode,
    lineItems: lineItems
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => mapLiquidLineItem(entry, currencyCode)),
  };
}

export function mapShopifyCustomerAccountSnapshot(
  snapshot: ShopifyCustomerAccountSnapshot | null | undefined,
): ShopifyCustomerAccountSummary | null {
  const root = asRecord(snapshot);
  if (!root) {
    return null;
  }

  const customerRecord = asRecord(root.customer);
  const orders = Array.isArray(root.orders) ? root.orders : [];

  return {
    customer: {
      displayName: resolveCustomerName(customerRecord),
      email: asString(asRecord(customerRecord?.emailAddress)?.emailAddress || customerRecord?.email),
      phone: asString(asRecord(customerRecord?.phoneNumber)?.phoneNumber || customerRecord?.phone),
    },
    orders: orders
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map(mapLiquidOrder)
      .filter((order): order is ShopifyCustomerAccountOrder => Boolean(order))
      .sort((left, right) => new Date(right.processedAt).getTime() - new Date(left.processedAt).getTime()),
  };
}

export function hasShopifyCustomerAccountClientId(): boolean {
  return Boolean(getCustomerAccountClientId());
}

async function discoverFromBase(base: string): Promise<ShopifyCustomerAccountDiscovery | null> {
  const normalizedBase = normalizeDiscoveryBaseUrl(base);
  if (!normalizedBase) {
    return null;
  }

  const cacheKey = normalizedBase.replace(/\/+$/, "");
  const cachedDiscovery = readCachedDiscovery(cacheKey);
  if (cachedDiscovery) {
    return cachedDiscovery;
  }

  const inFlightDiscovery = discoveryInFlightRequests.get(cacheKey);
  if (inFlightDiscovery) {
    return inFlightDiscovery;
  }

  const discoveryPromise = (async () => {
    try {
      const discoveryBase = normalizedBase.replace(/\/+$/, "");
      const [openidConfig, apiConfig] = await Promise.all([
        fetchJson<DiscoveryResponse>(`${discoveryBase}/.well-known/openid-configuration`),
        fetchJson<CustomerAccountApiDiscoveryResponse>(`${discoveryBase}/.well-known/customer-account-api`),
      ]);

      if (!openidConfig.authorization_endpoint || !openidConfig.token_endpoint || !apiConfig.graphql_api) {
        return null;
      }

      const discovered = {
        authorizationEndpoint: openidConfig.authorization_endpoint,
        tokenEndpoint: openidConfig.token_endpoint,
        graphqlEndpoint: apiConfig.graphql_api,
        logoutEndpoint: openidConfig.end_session_endpoint,
        shopBaseUrl: discoveryBase,
      };

      persistCachedDiscovery(discoveryBase, discovered);
      return discovered;
    } catch {
      return null;
    }
  })();

  discoveryInFlightRequests.set(cacheKey, discoveryPromise);

  try {
    return await discoveryPromise;
  } finally {
    discoveryInFlightRequests.delete(cacheKey);
  }
}

export async function discoverShopifyCustomerAccount(): Promise<ShopifyCustomerAccountDiscovery> {
  const candidates = getDiscoveryBaseCandidates();
  for (const candidate of candidates) {
    const discovered = await discoverFromBase(candidate);
    if (discovered) {
      return discovered;
    }
  }

  throw new Error("Unable to discover Shopify customer account endpoints");
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return typeof window.localStorage === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function persistAuthRequest(value: ShopifyCustomerAccountAuthRequest): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(CUSTOMER_ACCOUNT_SESSION_KEY, JSON.stringify(value));
}

function readAuthRequest(): ShopifyCustomerAccountAuthRequest | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(CUSTOMER_ACCOUNT_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShopifyCustomerAccountAuthRequest>;
    if (
      !parsed ||
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.codeChallenge !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.shopBaseUrl !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return parsed as ShopifyCustomerAccountAuthRequest;
  } catch {
    return null;
  }
}

function clearAuthRequest(): void {
  const storage = getStorage();
  storage?.removeItem(CUSTOMER_ACCOUNT_SESSION_KEY);
}

function readStoredToken(): ShopifyCustomerAccountToken | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(CUSTOMER_ACCOUNT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShopifyCustomerAccountToken>;
    if (
      !parsed ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : undefined,
      idToken: typeof parsed.idToken === "string" ? parsed.idToken : undefined,
      expiresAt: parsed.expiresAt,
      scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
      tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : undefined,
    };
  } catch {
    return null;
  }
}

function persistToken(token: ShopifyCustomerAccountToken): void {
  const storage = getStorage();
  storage?.setItem(CUSTOMER_ACCOUNT_STORAGE_KEY, JSON.stringify(token));
}

export function clearShopifyCustomerAccountSession(): void {
  clearAuthRequest();
  const storage = getStorage();
  storage?.removeItem(CUSTOMER_ACCOUNT_STORAGE_KEY);
}

export function getStoredShopifyCustomerAccountToken(): ShopifyCustomerAccountToken | null {
  return readStoredToken();
}

export async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateShopifyAuthState(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function generateShopifyAuthNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function buildShopifyCustomerAccountAuthorizationUrl(options: ShopifyAccountAuthOptions): string {
  const url = new URL(options.authorizationEndpoint);
  const params = new URLSearchParams();

  params.set("scope", DEFAULT_SCOPE);
  params.set("client_id", options.clientId);
  params.set("response_type", "code");
  params.set("redirect_uri", options.redirectUri);
  params.set("state", options.state);
  params.set("nonce", options.nonce);
  params.set("code_challenge", options.codeChallenge);
  params.set("code_challenge_method", "S256");

  if (options.loginHint) {
    params.set("login_hint", options.loginHint);
  }

  if (options.regionCountry) {
    params.set("region_country", options.regionCountry);
  }

  if (options.locale) {
    params.set("locale", options.locale);
  }

  url.search = params.toString();
  return url.toString();
}

function getCustomerAccountClientId(): string {
  const runtime = getRuntimeContext();
  const runtimeValue = asString((runtime as Record<string, unknown>).customerAccountClientId);
  if (runtimeValue) {
    return runtimeValue;
  }

  return asString(import.meta.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID);
}

export function resolveShopifyCustomerAccountRedirectBaseUrl(options: {
  browserOrigin?: string | null;
  shopBaseOrigin?: string | null;
} = {}): string {
  const shopBaseOrigin = normalizeBaseUrl(options.shopBaseOrigin ?? getShopBaseOrigin());
  if (shopBaseOrigin) {
    return shopBaseOrigin;
  }

  const browserOrigin = normalizeBaseUrl(options.browserOrigin ?? getWindowBaseUrl());
  if (browserOrigin) {
    return browserOrigin;
  }

  return getWindowBaseUrl();
}

function getRedirectUri(): string {
  const runtime = getRuntimeContext();
  const redirectPath = asString((runtime as Record<string, unknown>).customerAccountRedirectPath) || DEFAULT_REDIRECT_PATH;
  const redirectBaseUrl = resolveShopifyCustomerAccountRedirectBaseUrl();

  try {
    return new URL(redirectPath, redirectBaseUrl).toString();
  } catch {
    return `${redirectBaseUrl}${redirectPath.startsWith("/") ? redirectPath : DEFAULT_REDIRECT_PATH}`;
  }
}

function normalizeReturnTarget(input: string | undefined | null): string {
  const raw = asString(input);
  if (!raw) {
    return "/account/orders";
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw, getWindowBaseUrl());
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/account/orders";
  } catch {
    return "/account/orders";
  }
}

export async function prepareShopifyCustomerAccountSignIn(options: {
  email?: string;
  returnTo?: string;
  locale?: string;
  regionCountry?: string;
} = {}): Promise<{ authorizationUrl: string; request: ShopifyCustomerAccountAuthRequest }> {
  const discovery = await discoverShopifyCustomerAccount();
  const clientId = getCustomerAccountClientId();
  if (!clientId) {
    throw new Error("Missing Shopify customer account client id");
  }

  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateShopifyAuthState();
  const nonce = generateShopifyAuthNonce();
  const redirectUri = getRedirectUri();
  const request: ShopifyCustomerAccountAuthRequest = {
    state,
    nonce,
    codeVerifier,
    codeChallenge,
    returnTo: normalizeReturnTarget(options.returnTo),
    loginHint: asString(options.email) || undefined,
    redirectUri,
    shopBaseUrl: discovery.shopBaseUrl,
    createdAt: Date.now(),
  };

  persistAuthRequest(request);

  return {
    request,
    authorizationUrl: buildShopifyCustomerAccountAuthorizationUrl({
      authorizationEndpoint: discovery.authorizationEndpoint,
      clientId,
      redirectUri,
      state,
      nonce,
      codeChallenge,
      loginHint: request.loginHint,
      regionCountry: asString(options.regionCountry) || DEFAULT_REGION_COUNTRY,
      locale: asString(options.locale) || DEFAULT_LOCALE,
    }),
  };
}

async function exchangeAuthorizationCode(
  tokenEndpoint: string,
  request: ShopifyCustomerAccountAuthRequest,
  code: string,
): Promise<ShopifyCustomerAccountToken> {
  const clientId = getCustomerAccountClientId();
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("code", code);
  body.set("code_verifier", request.codeVerifier);
  body.set("redirect_uri", request.redirectUri);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const expiresIn = Math.max(60, Math.floor(asNumber(payload.expires_in) || 0));
  const token: ShopifyCustomerAccountToken = {
    accessToken: asString(payload.access_token),
    refreshToken: asString(payload.refresh_token) || undefined,
    idToken: asString(payload.id_token) || undefined,
    scope: asString(payload.scope) || undefined,
    tokenType: asString(payload.token_type) || undefined,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  if (!token.accessToken) {
    throw new Error("Token response did not include an access token");
  }

  persistToken(token);
  return token;
}

async function refreshAccessToken(tokenEndpoint: string, token: ShopifyCustomerAccountToken): Promise<ShopifyCustomerAccountToken> {
  if (!token.refreshToken) {
    throw new Error("No refresh token is available");
  }

  const clientId = getCustomerAccountClientId();
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", clientId);
  body.set("refresh_token", token.refreshToken);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const expiresIn = Math.max(60, Math.floor(asNumber(payload.expires_in) || 0));
  const nextToken: ShopifyCustomerAccountToken = {
    accessToken: asString(payload.access_token),
    refreshToken: asString(payload.refresh_token) || token.refreshToken,
    idToken: asString(payload.id_token) || token.idToken,
    scope: asString(payload.scope) || token.scope,
    tokenType: asString(payload.token_type) || token.tokenType,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  if (!nextToken.accessToken) {
    throw new Error("Refresh response did not include an access token");
  }

  persistToken(nextToken);
  return nextToken;
}

async function fetchCustomerAccountGraphql<T>(
  graphqlEndpoint: string,
  token: ShopifyCustomerAccountToken,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      Authorization: token.accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Customer Account API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    const message = payload.errors[0]?.message || "Customer Account API returned an error";
    throw new Error(message);
  }

  if (!payload.data) {
    throw new Error("Customer Account API response missing data");
  }

  return payload.data;
}

const CUSTOMER_ACCOUNT_QUERY = `
  query CustomerAccountOrders($first: Int!) {
    customer {
      displayName
      emailAddress {
        emailAddress
      }
      phoneNumber {
        phoneNumber
      }
      orders(first: $first, reverse: true) {
        edges {
          node {
            id
            name
            number
            confirmationNumber
            processedAt
            updatedAt
            financialStatus
            fulfillmentStatus
            statusPageUrl
            phone
            totalPrice {
              amount
              currencyCode
            }
            lineItems(first: 6) {
              edges {
                node {
                  title
                  quantity
                  variantTitle
                  presentmentTitle
                  totalPrice {
                    amount
                    currencyCode
                  }
                  currentTotalPrice {
                    amount
                    currencyCode
                  }
                  price {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function loadShopifyCustomerOrders(): Promise<ShopifyCustomerAccountSummary> {
  const runtimeSnapshot = mapShopifyCustomerAccountSnapshot(getRuntimeContext().customerAccountSnapshot as ShopifyCustomerAccountSnapshot | null);
  let token = readStoredToken();

  if (!token) {
    if (runtimeSnapshot) {
      return runtimeSnapshot;
    }

    throw new Error("Shopify customer account session is missing");
  }

  const discovery = await discoverShopifyCustomerAccount();

  if (token.expiresAt <= Date.now() + 30_000 && token.refreshToken) {
    token = await refreshAccessToken(discovery.tokenEndpoint, token);
  }

  const data = await fetchCustomerAccountGraphql<ShopifyCustomerAccountQueryResponse>(
    discovery.graphqlEndpoint,
    token,
    CUSTOMER_ACCOUNT_QUERY,
    {
      first: ORDERS_PAGE_SIZE,
    },
  );

  return toShopifyCustomerAccountSummary(data);
}

export async function completeShopifyCustomerAccountSignInFromUrl(
  searchParams: URLSearchParams,
): Promise<{ success: boolean; returnTo: string }> {
  const error = searchParams.get("error");
  if (error) {
    clearAuthRequest();
    throw new Error(searchParams.get("error_description") || error);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    throw new Error("Missing Shopify authorization code");
  }

  const request = readAuthRequest();
  if (!request) {
    throw new Error("No Shopify customer account request was found");
  }

  if (request.state !== state) {
    throw new Error("Shopify customer account state mismatch");
  }

  const discovery = await discoverFromBase(request.shopBaseUrl);
  if (!discovery) {
    throw new Error("Unable to resolve Shopify customer account token endpoint");
  }

  await exchangeAuthorizationCode(discovery.tokenEndpoint, request, code);
  clearAuthRequest();

  return {
    success: true,
    returnTo: request.returnTo,
  };
}

export function getShopifyCustomerAccountSessionHint(): ShopifyCustomerAccountAuthRequest | null {
  return readAuthRequest();
}

export async function ensureShopifyCustomerAccountToken(): Promise<ShopifyCustomerAccountToken | null> {
  const token = readStoredToken();
  if (!token) {
    return null;
  }

  if (token.expiresAt > Date.now() + 30_000) {
    return token;
  }

  if (!token.refreshToken) {
    return token;
  }

  const discovery = await discoverShopifyCustomerAccount();
  return refreshAccessToken(discovery.tokenEndpoint, token);
}

export function mapShopifyCustomerOrders(response: ShopifyCustomerAccountQueryResponse): ShopifyCustomerAccountSummary {
  return toShopifyCustomerAccountSummary(response);
}
