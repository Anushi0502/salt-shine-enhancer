import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackAnalyticsEvent } from "./analytics-events";

describe("trackAnalyticsEvent", () => {
  beforeEach(() => {
    window.dataLayer = [];
    window.gtag = vi.fn();
  });

  it("writes GA4-compatible events to existing dataLayer and gtag hooks", () => {
    trackAnalyticsEvent("view_item", { currency: "USD", value: 24, optional: undefined });

    expect(window.dataLayer).toEqual([{ event: "view_item", currency: "USD", value: 24 }]);
    expect(window.gtag).toHaveBeenCalledWith("event", "view_item", { currency: "USD", value: 24 });
  });
});

