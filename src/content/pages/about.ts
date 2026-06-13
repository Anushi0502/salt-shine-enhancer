import type { EditorialPageCopy } from "@/content/pages/types";

const aboutPageCopy: EditorialPageCopy = {
  eyebrow: "About SALT",
  title: "About SALT Online Store",
  summary:
    "SALT is a calmer storefront for useful products, practical gifting, and everyday essentials that are easier to scan and easier to trust.",
  chips: ["Founder-led", "Curated assortment", "Weekly refresh", "Support-first"],
  sections: [
    {
      id: "our-story",
      kind: "rich",
      title: "Our Story",
      body: [
        "SALT grew from Courtney R. Jones' experience in senior care and a simple conviction: shopping should feel helpful, honest, and less noisy.",
        "What started as a caregiving mindset became a broader store for home, gifting, garden, kitchen, apparel, and everyday support.",
      ],
    },
    {
      id: "what-we-offer",
      kind: "cards",
      title: "What We Offer",
      items: [
        {
          title: "Home Decor",
          body: "Warm accents, lighting, and small pieces that help a room feel more settled and personal.",
        },
        {
          title: "Fashion & Apparel",
          body: "Seasonal clothing chosen for wearable comfort, straightforward styling, and easy pairing.",
        },
        {
          title: "Gardening Tools",
          body: "Durable tools for casual gardeners and everyday tasks that need a little more performance.",
        },
        {
          title: "Pet Care",
          body: "Convenience items that make routine care easier for pets and the people looking after them.",
        },
        {
          title: "Cookware & Kitchen Essentials",
          body: "Space-saving organizers, non-stick cookware, bakeware, and gadgets for a calmer kitchen.",
        },
      ],
    },
    {
      id: "why-people-stay",
      kind: "cards",
      title: "Why People Stay",
      items: [
        {
          title: "Free Shipping Across the USA",
          body: "No minimum purchase barrier, so smaller orders still feel worthwhile.",
        },
        {
          title: "Unique Products, Outstanding Service, Exclusive Pricing",
          body: "The catalog aims to balance individuality, practicality, and value.",
        },
        {
          title: "Fresh New Arrivals Weekly",
          body: "The store keeps moving so returning shoppers have new reasons to browse.",
        },
      ],
    },
    {
      id: "faq",
      kind: "faq",
      title: "FAQ",
      items: [
        {
          question: "Who is SALT for?",
          answer:
            "SALT is for shoppers who want useful, giftable, and approachable products in one curated place.",
        },
        {
          question: "How often does the catalog change?",
          answer:
            "The assortment is refreshed weekly so the store stays current and easy to revisit.",
        },
      ],
    },
    {
      id: "family-of-brands",
      kind: "rich",
      title: "Family of Brands",
      body: [
        "SALT sits alongside a care-rooted brand family, and that background still shapes how products are chosen and how the store speaks.",
        "The same empathy that informed Senior and Living Today now informs a broader set of categories, support cues, and editorial pages.",
      ],
    },
  ],
  actions: [
    { label: "Shop the catalog", to: "/shop", primary: true },
    { label: "Contact support", to: "/contact" },
  ],
};

export default aboutPageCopy;
