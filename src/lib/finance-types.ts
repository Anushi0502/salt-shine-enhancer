export type FinanceSourceState = "connected" | "partial" | "missing" | "manual" | "unavailable";

export type FinanceSourceStatus = {
  shopify: FinanceSourceState;
  payouts: FinanceSourceState;
  dsers: FinanceSourceState;
  subscriptions: FinanceSourceState;
  messages: string[];
};

export type FinanceKpis = {
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  netSalesCents: number;
  shippingIncomeCents: number;
  taxCollectedCents: number;
  cogsCents: number;
  paymentFeesCents: number;
  subscriptionCostsCents: number;
  payoutsReceivedCents: number;
  grossProfitCents: number;
  operatingProfitCents: number;
  marginPercent: number | null;
  orderCount: number;
  costCoveragePercent: number | null;
};

export type FinancePnlRow = {
  label: string;
  cents: number;
  tone: "positive" | "negative" | "neutral" | "muted";
  detail: string;
};

export type FinancePayout = {
  id: string;
  issuedAt: string;
  status: string;
  type: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
};

export type FinanceSubscription = {
  name: string;
  category: string;
  interval: string;
  allocatedCents: number;
  currency: string;
  source: string;
  active: boolean;
};

export type FinanceOrderRow = {
  id: string;
  name: string;
  createdAt: string;
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  netRevenueCents: number;
  cogsCents: number;
  allocatedFeesCents: number;
  profitCents: number;
  marginPercent: number | null;
  currency: string;
  itemCount: number;
  costCoverage: "complete" | "partial" | "missing";
};

export type FinanceException = {
  kind: string;
  message: string;
  count: number;
  severity: "high" | "medium" | "low";
};

export type FinancePeriod = {
  start: string;
  end: string;
  timezone: string;
};

export type FinanceSummary = {
  authenticated: true;
  generatedAt: string;
  currency: string;
  period: FinancePeriod;
  sources: FinanceSourceStatus;
  kpis: FinanceKpis;
  pnlRows: FinancePnlRow[];
  payouts: FinancePayout[];
  subscriptions: FinanceSubscription[];
  orders: FinanceOrderRow[];
  exceptions: FinanceException[];
};
