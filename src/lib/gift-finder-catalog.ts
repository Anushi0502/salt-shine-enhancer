import type { GiftFinderProduct } from "@/components/salt/FreeGiftFinder";

export type GiftFinderCatalogSource = {
  id: number;
  title: string;
  handle: string;
  price: number;
};

const ALL_RECIPIENTS: NonNullable<GiftFinderProduct["recipient"]> = [
  "partner",
  "family",
  "friend",
  "self",
];

const ALL_OCCASIONS: NonNullable<GiftFinderProduct["occasion"]> = [
  "birthday",
  "holiday",
  "thank-you",
  "just-because",
];

function normalizedText(source: GiftFinderCatalogSource): string {
  return `${source.title} ${source.handle}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferInterests(text: string): NonNullable<GiftFinderProduct["interest"]> {
  const interests = new Set<NonNullable<GiftFinderProduct["interest"]>[number]>();

  if (/(home|kitchen|cook|decor|storage|table|garden|lighting|bedding)/.test(text)) {
    interests.add("home");
  }
  if (/(jean|fashion|watch|belt|bag|shoe|jewel|bracelet|dress|style|accessor)/.test(text)) {
    interests.add("style");
  }
  if (/(earbud|headphone|charger|phone|laptop|keyboard|mouse|bluetooth|electronic|smart|tech)/.test(text)) {
    interests.add("tech");
  }
  if (/(wellness|beauty|skin|hair|massage|fitness|yoga|sleep|care)/.test(text)) {
    interests.add("wellness");
  }

  if (!interests.size) interests.add("home");
  return [...interests];
}

function inferRecipients(text: string): NonNullable<GiftFinderProduct["recipient"]> {
  if (/(women|woman|ladies|female|girl|mom|mother)/.test(text)) return ["partner", "family", "friend"];
  if (/(men|man|male|boy|dad|father)/.test(text)) return ["partner", "family", "friend"];
  if (/(kid|child|baby|children)/.test(text)) return ["family", "friend"];
  return ALL_RECIPIENTS;
}

function inferBudget(price: number): NonNullable<GiftFinderProduct["budget"]> {
  if (price < 25) return ["under-25"];
  if (price <= 50) return ["25-50"];
  return ["over-50"];
}

export function toGiftFinderProduct(
  source: GiftFinderCatalogSource,
  index = 0,
): GiftFinderProduct {
  const title = String(source.title || "SALT find").replace(/\s+/g, " ").trim();
  const handle = String(source.handle || source.id || `salt-find-${index}`).trim();
  const price = Number(source.price);
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const text = normalizedText({ ...source, title, handle, price: safePrice });

  return {
    slug: handle,
    label: title,
    description: "A live SALT best seller selected from the current catalog.",
    href: `/products/${handle}`,
    recipient: inferRecipients(text),
    occasion: ALL_OCCASIONS,
    budget: inferBudget(safePrice),
    interest: inferInterests(text),
    priority: Math.max(0, 100 - index),
  };
}

