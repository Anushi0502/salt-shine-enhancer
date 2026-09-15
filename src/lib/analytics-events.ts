export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

/**
 * Send a GA4-compatible event to any existing GTM/gtag integration.
 * This is intentionally transport-agnostic: it adds no script, account, or paid service.
 */
export function trackAnalyticsEvent(eventName: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  const cleaned = cleanParams(params);
  window.dataLayer?.push({ event: eventName, ...cleaned });
  window.gtag?.("event", eventName, cleaned);
}

