import { describe, expect, it } from "vitest";
import {
  buildJudgeMeReviewFingerprint,
  dedupeJudgeMeTestimonials,
  normalizeJudgeMeReview,
  prioritizeJudgeMeShopDomains,
  type JudgeMeTestimonial,
} from "@/lib/judgeme";

function makeReview(input: Partial<JudgeMeTestimonial> = {}): JudgeMeTestimonial {
  return {
    id: input.id || "review-1",
    productId: input.productId ?? 1,
    author: input.author || "Benjamin Wright",
    title: input.title || "Great product",
    body: input.body || "This isn�t just a humidifierâ€”itâ€™s a conversation starter.",
    sourceLabel: input.sourceLabel || "Judge.me review",
    rating: input.rating ?? 5,
    createdAtRaw: input.createdAtRaw || "2026-04-22T00:00:00Z",
    createdAtMs: input.createdAtMs ?? Date.parse("2026-04-22T00:00:00Z"),
    verifiedBuyer: input.verifiedBuyer ?? true,
    source: "judgeme",
  };
}

describe("Judge.me review normalization", () => {
  it("tries the permanent Shopify domain before branded storefront domains", () => {
    expect(
      prioritizeJudgeMeShopDomains([
        "https://www.saltonlinestore.com/",
        "0309D3-72.myshopify.com",
        "www.saltonlinestore.com",
      ]),
    ).toEqual(["0309d3-72.myshopify.com", "www.saltonlinestore.com"]);
  });

  it("repairs common encoding artifacts in review text", () => {
    const review = normalizeJudgeMeReview(makeReview());

    expect(review.body).toBe("This isn't just a humidifier-it's a conversation starter.");
  });

  it("treats duplicate ids as one review while preserving distinct reviews with the same content", () => {
    const uniqueReviews = dedupeJudgeMeTestimonials([
      makeReview({ id: "review-1", productId: 1 }),
      makeReview({ id: "review-1", productId: 2 }),
      makeReview({ id: "review-2", productId: 2 }),
      makeReview({
        id: "review-3",
        productId: 3,
        author: "Ava Richardson",
        body: "The jellyfish smoke ring is such a cool visual.",
      }),
    ]);

    expect(uniqueReviews).toHaveLength(3);
    expect(buildJudgeMeReviewFingerprint(uniqueReviews[0])).toBe(
      "benjamin wright|great product|this isn't just a humidifier-it's a conversation starter.",
    );
  });
});
