import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackAnalyticsEvent } from "./analytics-events";

describe("trackAnalyticsEvent", () => {
  beforeEach(() => {
    const testWindow = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
      Shopify?: { analytics?: { publish?: (...args: unknown[]) => unknown } };
    };
    delete testWindow.dataLayer;
    delete testWindow.gtag;
    delete testWindow.Shopify;
  });

  it("writes GA4-compatible events to existing dataLayer and gtag hooks", () => {
    window.dataLayer = [];
    window.gtag = vi.fn();

    trackAnalyticsEvent("view_item", { currency: "USD", value: 24, optional: undefined });

    expect(window.dataLayer).toEqual([{ event: "view_item", currency: "USD", value: 24 }]);
    expect(window.gtag).toHaveBeenCalledWith("event", "view_item", { currency: "USD", value: 24 });
  });

  it("falls back to the Shopify Web Pixels publisher when no direct bridge exists", () => {
    const publish = vi.fn();
    const testWindow = window as unknown as {
      Shopify?: { analytics?: { publish?: (...args: unknown[]) => unknown } };
    };
    testWindow.Shopify = { analytics: { publish } };

    trackAnalyticsEvent("select_item", { item_list_name: "Resource Hub" });

    expect(publish).toHaveBeenCalledWith("select_item", { item_list_name: "Resource Hub" });
  });
});
