export type FinanceSourceState = "connected" | "partial" | "missing" | "manual" | "unavailable";

export type FinanceSourceStatus = {
  shopify: FinanceSourceState;
  payouts: FinanceSourceState;
  dsers: FinanceSourceState;
  subscriptions: FinanceSourceState;
  campaigns: FinanceSourceState;
  reconciliation: FinanceSourceState;
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
  campaignCostsCents: number;
  subscriptionCostsCents: number;
  payoutsReceivedCents: number;
  grossProfitCents: number;
  operatingProfitCents: number;
  marginPercent: number | null;
  orderCount: number;
  cancelledOrdersCount: number;
  disputedOrdersCount: number;
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

export type FinanceCampaignSpend = {
  key: string;
  title: string;
  source: string;
  medium: string;
  campaign: string;
  adSpendCents: number;
  allocatedCents: number;
  currency: string;
  orderCount: number;
};

export type FinanceReconciliationRow = {
  id: string;
  serialNo: number;
  month: string;
  shopifyOrderNumber: string;
  aliExpressOrderId: string;
  amountCents: number;
  invoice: string;
  feeThreshold: string;
  status: string;
  pendingPayoutCents: number;
  payoutPaidCents: number;
  orderCostCents: number;
  billCostCents: number;
  campaignCostCents: number;
  feeCents: number;
  profitCents: number;
  currency: string;
  source: string;
};

export type FinanceReconciliationTotals = {
  pendingPayoutCents: number;
  payoutPaidCents: number;
  orderCostCents: number;
  billCostCents: number;
  campaignCostCents: number;
  feeCents: number;
  profitCents: number;
  rowCount: number;
  paidCount: number;
  pendingCount: number;
};

export type FinanceReconciliationSummary = {
  state: FinanceSourceState;
  message?: string;
  totals: FinanceReconciliationTotals;
  rows: FinanceReconciliationRow[];
};

export type FinanceOrderRow = {
  id: string;
  name: string;
  createdAt: string;
  status: "open" | "cancelled" | "disputed" | "cancelled-disputed";
  grossSalesCents: number;
  discountsCents: number;
  refundsCents: number;
  netRevenueCents: number;
  cogsCents: number;
  allocatedFeesCents: number;
  campaignCostCents: number;
  profitCents: number;
  marginPercent: number | null;
  currency: string;
  itemCount: number;
  costCoverage: "complete" | "partial" | "missing";
  disputeCount: number;
  campaignKey: string | null;
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
  reconciliation: FinanceReconciliationSummary;
  payouts: FinancePayout[];
  subscriptions: FinanceSubscription[];
  campaignCosts: FinanceCampaignSpend[];
  orders: FinanceOrderRow[];
  exceptions: FinanceException[];
};
