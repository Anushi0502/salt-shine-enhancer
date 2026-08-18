import type { ShopifyShop } from "@/types/shopify";

type StructuredData = Record<string, unknown>;

type FaqEntry = {
  question: string;
  answer: string;
};

export function buildOrganizationStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: shop?.name || "SALT",
    url: origin,
  };
}

export function buildWebsiteStructuredData(
  shop: ShopifyShop | null | undefined,
  origin: string,
): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: shop?.name || "SALT",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildFaqStructuredData(
  faqs: FaqEntry[] | null | undefined,
  origin: string,
): StructuredData | null {
  const questions = (faqs || [])
    .map((faq) => ({
      question: String(faq.question || "").trim(),
      answer: String(faq.answer || "").trim(),
    }))
    .filter((faq) => faq.question && faq.answer)
    .map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    }));

  if (!questions.length || !origin) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${origin}/pages/faq`,
    mainEntity: questions,
  };
}
