declare global {
  interface Window {
    SALT_THEME_ASSET_BASE?: string;
    SALT_THEME_ASSETS?: Record<string, string>;
    SALT_RUNTIME_CONTEXT?: Partial<SaltRuntimeContext>;
  }
}

export type SaltRuntimeContext = {
  shopBaseUrl?: string;
  shopDomain?: string;
  shopName?: string;
  shopAppUrl?: string;
  customerAccountClientId?: string;
  customerAccountRedirectPath?: string;
  customerAccountSnapshot?: unknown;
  judgeMeShopDomain?: string;
  judgeMePrivateToken?: string;
  judgeMePublicToken?: string;
  currency?: string;
  template?: string;
  templateSuffix?: string;
  aboutHandle?: string;
  blogHandle?: string;
  supportEmail?: string;
  privacyPolicyUrl?: string;
  refundPolicyUrl?: string;
  shippingPolicyUrl?: string;
  contactPolicyUrl?: string;
  customerLoggedIn?: boolean;
  accountUrl?: string;
  accountLoginUrl?: string;
  accountRegisterUrl?: string;
  accountLogoutUrl?: string;
  accountAddressesUrl?: string;
  accountOrderHistoryUrl?: string;
  storefrontLoginUrl?: string;
};

const LOCAL_ASSET_PREFIXES = ["/assets/", "/favicon", "/vite.svg"];
const DEFAULT_BRANDED_SHOP_BASE = "https://www.saltonlinestore.com";
const DEFAULT_CANONICAL_SHOP_BASE = "https://0309d3-72.myshopify.com";

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

function isMyShopifyBase(input: string | null): boolean {
  if (!input) {
    return false;
  }

  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return hostname.endsWith(".myshopify.com");
  } catch {
    return false;
  }
}

function parseBooleanFlag(input: string | null): boolean | undefined {
  if (input == null) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function readRuntimeContextFromRootElement(): Partial<SaltRuntimeContext> {
  if (typeof window === "undefined") {
    return {};
  }

  const root = document.getElementById("salt-app-root") || document.getElementById("root");
  if (!root) {
    return {};
  }

  return {
    shopBaseUrl: root.getAttribute("data-shop-base-url") || undefined,
    shopDomain: root.getAttribute("data-shop-domain") || undefined,
    shopName: root.getAttribute("data-shop-name") || undefined,
    shopAppUrl: root.getAttribute("data-shop-app-url") || undefined,
    customerAccountClientId: root.getAttribute("data-customer-account-client-id") || undefined,
    customerAccountRedirectPath: root.getAttribute("data-customer-account-redirect-path") || undefined,
    judgeMeShopDomain: root.getAttribute("data-judgeme-shop-domain") || undefined,
    judgeMePrivateToken: root.getAttribute("data-judgeme-private-token") || undefined,
    judgeMePublicToken: root.getAttribute("data-judgeme-public-token") || undefined,
    currency: root.getAttribute("data-currency") || undefined,
    template: root.getAttribute("data-template") || undefined,
    templateSuffix: root.getAttribute("data-template-suffix") || undefined,
    aboutHandle: root.getAttribute("data-about-handle") || undefined,
    blogHandle: root.getAttribute("data-blog-handle") || undefined,
    supportEmail: root.getAttribute("data-support-email") || undefined,
    privacyPolicyUrl: root.getAttribute("data-privacy-policy-url") || undefined,
    refundPolicyUrl: root.getAttribute("data-refund-policy-url") || undefined,
    shippingPolicyUrl: root.getAttribute("data-shipping-policy-url") || undefined,
    contactPolicyUrl: root.getAttribute("data-contact-policy-url") || undefined,
    customerLoggedIn: parseBooleanFlag(root.getAttribute("data-customer-logged-in")),
    accountUrl: root.getAttribute("data-account-url") || undefined,
    accountLoginUrl: root.getAttribute("data-account-login-url") || undefined,
    accountRegisterUrl: root.getAttribute("data-account-register-url") || undefined,
    accountLogoutUrl: root.getAttribute("data-account-logout-url") || undefined,
    accountAddressesUrl: root.getAttribute("data-account-addresses-url") || undefined,
    accountOrderHistoryUrl: root.getAttribute("data-account-order-history-url") || undefined,
    storefrontLoginUrl: root.getAttribute("data-storefront-login-url") || undefined,
  };
}

function readRuntimeContextFromJsonScript(): Partial<SaltRuntimeContext> {
  if (typeof window === "undefined") {
    return {};
  }

  const node = document.getElementById("salt-runtime-context");
  if (!node?.textContent) {
    return {};
  }

  try {
    const parsed = JSON.parse(node.textContent) as Partial<SaltRuntimeContext>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readRuntimeContext(): SaltRuntimeContext {
  const fromWindow = typeof window !== "undefined" ? window.SALT_RUNTIME_CONTEXT || {} : {};
  const fromScript = readRuntimeContextFromJsonScript();
  const fromRoot = readRuntimeContextFromRootElement();

  return {
    ...fromScript,
    ...fromRoot,
    ...fromWindow,
  };
}

const RUNTIME_CONTEXT = readRuntimeContext();
const SHOP_BASE_ORIGIN = (() => {
  const normalizedAppUrl = normalizeBaseUrl(RUNTIME_CONTEXT.shopAppUrl);
  const normalizedDomain = normalizeBaseUrl(RUNTIME_CONTEXT.shopDomain);
  const normalizedBaseUrl = normalizeBaseUrl(RUNTIME_CONTEXT.shopBaseUrl);
  const brandedFromContext = [normalizedAppUrl, normalizedBaseUrl, normalizedDomain].find(
    (candidate) => candidate && !isMyShopifyBase(candidate),
  );
  if (brandedFromContext) {
    return brandedFromContext;
  }

  const brandedFromEnv =
    normalizeBaseUrl(import.meta.env.VITE_SALT_SHOP_URL) ||
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL);
  if (brandedFromEnv && !isMyShopifyBase(brandedFromEnv)) {
    return brandedFromEnv;
  }

  const brandedFallback = normalizeBaseUrl(DEFAULT_BRANDED_SHOP_BASE);
  if (brandedFallback) {
    return brandedFallback;
  }

  const fromContext =
    normalizedBaseUrl ||
    normalizedAppUrl ||
    (isMyShopifyBase(normalizedDomain) ? normalizedDomain : null) ||
    normalizedDomain;
  if (fromContext) {
    return fromContext;
  }

  if (brandedFromEnv) {
    return brandedFromEnv;
  }

  const fallbackCanonical = normalizeBaseUrl(DEFAULT_CANONICAL_SHOP_BASE);
  if (fallbackCanonical) {
    return fallbackCanonical;
  }

  if (typeof window !== "undefined") {
    const fromOrigin = normalizeBaseUrl(window.location.origin);
    if (fromOrigin) {
      return fromOrigin;
    }
  }

  return "";
})();

export function getRuntimeContext(): SaltRuntimeContext {
  return RUNTIME_CONTEXT;
}

export function getShopBaseOrigin(): string {
  return SHOP_BASE_ORIGIN;
}

function normalizeThemeAssetBase(input: string | null | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  return raw.endsWith("/") ? raw : `${raw}/`;
}

function getThemeAssetBase(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeThemeAssetBase(window.SALT_THEME_ASSET_BASE);
}

export function resolveThemeAsset(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }

  const mappedAsset = window.SALT_THEME_ASSETS?.[path];
  if (mappedAsset) {
    return mappedAsset;
  }

  if (path.startsWith("/assets/")) {
    const themeAssetBase = getThemeAssetBase();
    if (themeAssetBase) {
      return `${themeAssetBase}${path.slice("/assets/".length)}`;
    }
  }

  return path;
}

export function normalizeShopifyAssetUrl(input: string | null | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  const resolved = resolveThemeAsset(raw);

  if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(resolved)) {
    return resolved;
  }

  if (/^https?:\/\//i.test(resolved)) {
    return resolved;
  }

  if (resolved.startsWith("//")) {
    return `https:${resolved}`;
  }

  if (resolved.startsWith("/")) {
    if (!SHOP_BASE_ORIGIN || LOCAL_ASSET_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
      return resolved;
    }

    return `${SHOP_BASE_ORIGIN}${resolved}`;
  }

  return resolved;
}

function resolveStorePath(input: string | null | undefined, fallbackPath: string): string {
  const value = String(input || "").trim() || fallbackPath;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return `${url.pathname}${url.search}${url.hash}` || fallbackPath;
    } catch {
      return fallbackPath;
    }
  }

  if (value.startsWith("//")) {
    try {
      const url = new URL(`https:${value}`);
      return `${url.pathname}${url.search}${url.hash}` || fallbackPath;
    } catch {
      return fallbackPath;
    }
  }

  if (value.startsWith("?")) {
    return `${fallbackPath}${value}`;
  }

  if (value.startsWith("/")) {
    return value;
  }

  return value.startsWith("#") ? `${fallbackPath}${value}` : `/${value}`;
}

export function resolveStorefrontPath(input: string | null | undefined, fallbackPath: string): string {
  return resolveStorePath(input, fallbackPath);
}

function getCurrentReturnPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  const path = window.location.pathname || "/";
  const query = window.location.search || "";
  const hash = window.location.hash || "";
  return `${path}${query}${hash}` || "/";
}

function appendReturnUrl(path: string, returnPath: string): string {
  const rawPath = String(path || "").trim();
  const preserveOrigin = /^https?:\/\//i.test(rawPath) || rawPath.startsWith("//");

  try {
    const url = new URL(rawPath, "https://salt.local");
    url.searchParams.set("return_url", returnPath);
    if (preserveOrigin) {
      return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = rawPath.includes("?") ? "&" : "?";
    return `${rawPath}${separator}return_url=${encodeURIComponent(returnPath)}`;
  }
}

function toAbsoluteStoreUrl(path: string): string {
  const normalizedPath = resolveStorePath(path, "/");
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  const runtimeOrigin =
    SHOP_BASE_ORIGIN ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!runtimeOrigin) {
    return normalizedPath;
  }

  return `${runtimeOrigin}${normalizedPath}`;
}

function toAbsoluteReturnUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return "/";
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
    return raw.startsWith("//") ? `https:${raw}` : raw;
  }

  const normalizedPath = resolveStorePath(raw, "/");
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }

  if (SHOP_BASE_ORIGIN) {
    return `${SHOP_BASE_ORIGIN}${normalizedPath}`;
  }

  return normalizedPath;
}

function toRelativeStorePath(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return "/";
  }

  try {
    const parsed = new URL(raw, "https://salt.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

export type ShopifyAccountRoutes = {
  isLoggedIn: boolean;
  loginEnabled: boolean;
  account: string;
  login: string;
  register: string;
  logout: string;
  addresses: string;
  orders: string;
  orderHistory: string;
  shopLogin: string;
};

export function getShopAppUrl(): string {
  const raw = String(RUNTIME_CONTEXT.shopAppUrl || "https://shop.app").trim() || "https://shop.app";
  return raw.replace(/\/+$/, "");
}

function hasNativeShopifyLoginMarkup(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const nativeLoginRoot = document.getElementById("salt-shop-login-native");
  if (!nativeLoginRoot) {
    return false;
  }

  const anchor = nativeLoginRoot.querySelector<HTMLAnchorElement>("a[href]");
  const button = nativeLoginRoot.querySelector<HTMLElement>("button, [role='button']");
  return Boolean(anchor?.href || button);
}

function hasShopifyCustomerAccountClientIdConfigured(): boolean {
  const runtimeValue = String(RUNTIME_CONTEXT.customerAccountClientId || "").trim();
  if (runtimeValue) {
    return true;
  }

  return String(import.meta.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || "").trim().length > 0;
}

function isShopifyLoginEnabledForRuntime(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  if (hasNativeShopifyLoginMarkup()) {
    return true;
  }

  return true;
}

export function buildShopLoginUrl(returnTarget?: string): string {
  if (!hasShopifyCustomerAccountClientIdConfigured()) {
    return buildShopHostedLoginUrl(String(returnTarget || "").trim() || getCurrentReturnPath());
  }

  const storefrontLoginPath = resolveStorePath(
    RUNTIME_CONTEXT.storefrontLoginUrl || RUNTIME_CONTEXT.accountLoginUrl,
    "/customer_authentication/login",
  );
  const storefrontLoginUrl = toAbsoluteStoreUrl(storefrontLoginPath);
  const resolvedReturnTargetAbsolute = toAbsoluteReturnUrl(
    String(returnTarget || "").trim() || getCurrentReturnPath(),
  );
  const resolvedReturnTargetRelative = toRelativeStorePath(resolvedReturnTargetAbsolute);
  const shopAppBase = getShopAppUrl();

  if (!isShopifyLoginEnabledForRuntime()) {
    const normalizedReturnTarget = resolvedReturnTargetAbsolute.toLowerCase();
    if (normalizedReturnTarget.includes("/account/orders")) {
      return `${shopAppBase}/account`;
    }

    return `${shopAppBase}/login`;
  }

  if (storefrontLoginUrl.includes("/customer_authentication/login")) {
    try {
      const loginUrl = new URL(storefrontLoginUrl);
      loginUrl.searchParams.set("return_to", resolvedReturnTargetRelative);
      loginUrl.searchParams.set("return_url", resolvedReturnTargetAbsolute);
      return loginUrl.toString();
    } catch {
      return appendReturnUrl(storefrontLoginUrl, resolvedReturnTargetAbsolute);
    }
  }

  return appendReturnUrl(storefrontLoginUrl, resolvedReturnTargetAbsolute);
}

export function buildShopHostedLoginUrl(returnTarget?: string): string {
  const storefrontLoginPath = resolveStorePath(
    RUNTIME_CONTEXT.storefrontLoginUrl || RUNTIME_CONTEXT.accountLoginUrl,
    "/customer_authentication/login",
  );
  const storefrontLoginUrl = toAbsoluteStoreUrl(storefrontLoginPath);
  const resolvedReturnTarget = resolveStorePath(
    String(returnTarget || "").trim() || "/account/orders",
    "/account/orders",
  );

  if (storefrontLoginUrl.includes("/customer_authentication/login")) {
    try {
      const loginUrl = new URL(storefrontLoginUrl);
      loginUrl.searchParams.set("return_to", resolvedReturnTarget);
      return loginUrl.toString();
    } catch {
      return appendReturnUrl(storefrontLoginUrl, resolvedReturnTarget);
    }
  }

  return appendReturnUrl(storefrontLoginUrl, resolvedReturnTarget);
}

export function openShopLogin(fallbackHref?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!isShopifyLoginEnabledForRuntime()) {
    const explicitFallback = String(fallbackHref || "").trim();
    if (explicitFallback) {
      window.location.assign(explicitFallback);
      return;
    }

    window.location.assign(`${getShopAppUrl()}/login`);
    return;
  }

  const explicitFallback = String(fallbackHref || "").trim();
  if (explicitFallback) {
    window.location.assign(explicitFallback);
    return;
  }

  const nativeLoginRoot = document.getElementById("salt-shop-login-native");
  const nativeAnchor = nativeLoginRoot?.querySelector<HTMLAnchorElement>("a[href]");
  if (nativeAnchor?.href) {
    const normalizedNativeHref = toAbsoluteStoreUrl(
      resolveStorePath(nativeAnchor.getAttribute("href") || nativeAnchor.href, "/account/login"),
    );
    window.location.assign(normalizedNativeHref);
    return;
  }

  const nativeButton = nativeLoginRoot?.querySelector<HTMLElement>("button, [role='button']");
  if (nativeButton) {
    nativeButton.click();
    return;
  }

  window.location.assign(buildShopLoginUrl());
}

export function getShopifyAccountRoutes(): ShopifyAccountRoutes {
  const loginFlag =
    typeof RUNTIME_CONTEXT.customerLoggedIn === "boolean"
      ? RUNTIME_CONTEXT.customerLoggedIn
      : String(RUNTIME_CONTEXT.customerLoggedIn || "").trim().toLowerCase() === "true";
  const loginEnabled = isShopifyLoginEnabledForRuntime();
  const shopAppAccountUrl = `${getShopAppUrl()}/account`;
  const shopAppLoginUrl = `${getShopAppUrl()}/login`;

  const account = toAbsoluteStoreUrl(resolveStorePath(RUNTIME_CONTEXT.accountUrl, "/account"));
  const storefrontLoginPath = resolveStorePath(
    RUNTIME_CONTEXT.storefrontLoginUrl || RUNTIME_CONTEXT.accountLoginUrl,
    "/customer_authentication/login",
  );
  const hasNewCustomerAccounts = storefrontLoginPath.includes("/customer_authentication/");
  const defaultOrdersPath = hasNewCustomerAccounts ? "/account/orders" : "/account";
  const runtimeOrdersPath = resolveStorePath(
    RUNTIME_CONTEXT.accountOrderHistoryUrl,
    defaultOrdersPath,
  );
  const accountPath = resolveStorePath(RUNTIME_CONTEXT.accountUrl, "/account");
  const normalizedOrdersPath =
    hasNewCustomerAccounts && (runtimeOrdersPath === "/account" || runtimeOrdersPath === accountPath)
      ? "/account/orders"
      : runtimeOrdersPath;
  const orders = toAbsoluteStoreUrl(normalizedOrdersPath);
  const orderHistory = loginFlag
    ? orders
    : loginEnabled
      ? buildShopLoginUrl(orders)
      : shopAppAccountUrl;

  return {
    isLoggedIn: loginFlag,
    loginEnabled,
    account,
    login: loginEnabled ? buildShopLoginUrl() : shopAppLoginUrl,
    register: loginEnabled
      ? toAbsoluteStoreUrl(resolveStorePath(RUNTIME_CONTEXT.accountRegisterUrl, "/account/register"))
      : shopAppLoginUrl,
    logout: toAbsoluteStoreUrl(resolveStorePath(RUNTIME_CONTEXT.accountLogoutUrl, "/account/logout")),
    addresses: toAbsoluteStoreUrl(resolveStorePath(RUNTIME_CONTEXT.accountAddressesUrl, "/account/addresses")),
    orders,
    orderHistory,
    shopLogin: loginEnabled ? buildShopLoginUrl() : "",
  };
}
