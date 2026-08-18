export const EVERYDAY_CARRY_COLLECTION_HANDLES = new Set([
  "shopping-bags-jute-bags",
  "travel-outdoor",
  "travel-organizers",
  "car-accessories",
  "portable-gadgets",
  "outdoor-essentials",
]);

export const EVERYDAY_CARRY_FAQS = [
  {
    question: "What are everyday carry essentials?",
    answer:
      "Everyday carry essentials are practical items that make work, school, commuting, errands, and travel easier to organize. SALT brings together bags, organizers, portable gadgets, and compact helpers that are easy to carry and useful in real routines.",
  },
  {
    question: "How do I choose an everyday carry item?",
    answer:
      "Start with the routine the item needs to support, then compare capacity, portability, compartments, materials, and the way you plan to use it. Choose the smallest practical option that protects the essentials you carry most often.",
  },
  {
    question: "Are these carry essentials useful for travel and work?",
    answer:
      "Yes. The collection is organized around flexible everyday use, including work bags, travel organizers, portable accessories, and space-saving helpers for commutes, short trips, school days, and outdoor plans.",
  },
] as const;

export function buildEverydayCarryFaqStructuredData(origin: string, path: string) {
  if (!origin || !path) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${origin}${path}`,
    mainEntity: EVERYDAY_CARRY_FAQS.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}
