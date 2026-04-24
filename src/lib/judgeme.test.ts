import { describe, expect, it } from "vitest";
import {
  buildJudgeMeReviewFingerprint,
  dedupeJudgeMeTestimonials,
  normalizeJudgeMeReview,
  type JudgeMeTestimonial,
} from "@/lib/judgeme";

function makeReview(input: Partial<JudgeMeTestimonial> = {}): JudgeMeTestimonial {
  return {
    id: input.id || "review-1",
    productId: input.productId ?? 1,
    author: input.author || "Benjamin Wright",
    title: input.title || "Great product",
    body: input.body || "This isn�t just a humidifierâ€”itâ€™s a conversation starter.",
    rating: input.rating ?? 5,
    createdAtRaw: input.createdAtRaw || "2026-04-22T00:00:00Z",
    createdAtMs: input.createdAtMs ?? Date.parse("2026-04-22T00:00:00Z"),
    verifiedBuyer: input.verifiedBuyer ?? true,
    source: "judgeme",
  };
}

describe("Judge.me review normalization", () => {
  it("repairs common encoding artifacts in review text", () => {
    const review = normalizeJudgeMeReview(makeReview());

    expect(review.body).toBe("This isn't just a humidifier-it's a conversation starter.");
  });

  it("treats duplicated content as one unique review even when ids differ", () => {
    const uniqueReviews = dedupeJudgeMeTestimonials([
      makeReview({ id: "review-1", productId: 1 }),
      makeReview({ id: "review-2", productId: 2 }),
      makeReview({
        id: "review-3",
        productId: 3,
        author: "Ava Richardson",
        body: "The jellyfish smoke ring is such a cool visual.",
      }),
    ]);

    expect(uniqueReviews).toHaveLength(2);
    expect(buildJudgeMeReviewFingerprint(uniqueReviews[0])).toBe(
      "benjamin wright|great product|this isn't just a humidifier-it's a conversation starter.",
    );
  });
});
