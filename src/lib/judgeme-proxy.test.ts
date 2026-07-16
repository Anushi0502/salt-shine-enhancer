import { describe, expect, it } from "vitest";
import { buildJudgeMeProxyUrl } from "@/lib/judgeme-proxy";

describe("Judge.me proxy URL builder", () => {
  it("uses Judge.me's cacheable CORS API directly and strips cache-busting timestamps", () => {
    const url = buildJudgeMeProxyUrl(
      "widgets/product_review",
      new URLSearchParams({
        api_token: "test-token",
        shop_domain: "example.myshopify.com",
        external_id: "123",
        page: "1",
        per_page: "100",
        t: "1710000000000",
      }),
    );

    expect(url).toBe(
      "https://api.judge.me/api/v1/widgets/product_review?api_token=test-token&shop_domain=example.myshopify.com&external_id=123&page=1&per_page=100",
    );
  });
});
