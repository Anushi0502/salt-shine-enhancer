const DEFAULT_SCOPE = "openid email customer-account-api:full";

type MoneyLike = {
  amount?: string | number | null;
  currencyCode?: string | null;
};

export type ShopifyAccountAuthOptions = {
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

export type ShopifyCustomerAccountLineItem = {
  title: string;
  quantity: number;
  variantTitle: string;
  totalAmount: number;
  totalLabel: string;
  currencyCode: string;
  imageUrl: string;
  imageAlt: string;
};

export type ShopifyCustomerAccountOrder = {
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

export type ShopifyCustomerAccountCustomer = {
  displayName: string;
  email: string;
  phone: string;
};

export type ShopifyCustomerAccountSummary = {
  customer: ShopifyCustomerAccountCustomer;
  orders: ShopifyCustomerAccountOrder[];
};

export type ShopifyCustomerAccountQueryResponse = {
  customer?: Record<string, unknown> | null;
};

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

function parseMoney(value: unknown): MoneyLike & { amount: number; label: string } {
  const money = asRecord(value);
  const amount = asNumber(money?.amount);
  const currencyCode = asString(money?.currencyCode) || "USD";

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

  const firstName = asString(customer.firstName);
  const lastName = asString(customer.lastName);
  const email = asString(asRecord(customer.emailAddress)?.emailAddress);
  const phone = asString(asRecord(customer.phoneNumber)?.phoneNumber);

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

  switch (raw) {
    case "PAID":
      return "Paid";
    case "AUTHORIZED":
      return "Authorized";
    case "PARTIALLY_PAID":
      return "Partially paid";
    case "PENDING":
      return "Pending";
    case "VOIDED":
      return "Voided";
    case "REFUNDED":
      return "Refunded";
    case "PARTIALLY_REFUNDED":
      return "Partially refunded";
    case "IN_PROGRESS":
      return "In progress";
    case "PENDING_FULFILLMENT":
      return "Pending fulfillment";
    case "PARTIALLY_FULFILLED":
      return "Partially fulfilled";
    case "FULFILLED":
      return "Fulfilled";
    case "ON_HOLD":
      return "On hold";
    case "RESTOCKED":
      return "Restocked";
    case "SCHEDULED":
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
    imageAlt: asString(image?.altText || input.title || input.name),
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

export function mapShopifyCustomerOrders(response: ShopifyCustomerAccountQueryResponse): ShopifyCustomerAccountSummary {
  return toShopifyCustomerAccountSummary(response);
}
