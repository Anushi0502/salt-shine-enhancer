export type EditorialStat = {
  label: string;
  value: string;
};

export type EditorialCard = {
  title: string;
  detail: string;
  to?: string;
};

export type EditorialStep = {
  step: string;
  title: string;
  detail: string;
};

export type EditorialFaq = {
  question: string;
  answer: string;
};

export type EditorialAction = {
  label: string;
  to?: string;
  href?: string;
  primary?: boolean;
};

export type EditorialFeaturedProduct = {
  handle: string;
  reason?: string;
  collectionLabel?: string;
};

export type EditorialPageContent = {
  handle: string;
  kicker: string;
  title: string;
  summary: string;
  seoTitle?: string;
  metaDescription?: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  stats: EditorialStat[];
  accent: {
    label: string;
    title: string;
    body: string;
    bullets: string[];
  };
  introParagraphs?: string[];
  cardsTitle?: string;
  cardsDescription?: string;
  cards?: EditorialCard[];
  stepsTitle?: string;
  stepsDescription?: string;
  steps?: EditorialStep[];
  chipsTitle?: string;
  chipsDescription?: string;
  chips?: string[];
  faqsTitle?: string;
  faqsDescription?: string;
  faqs?: EditorialFaq[];
  featuredProductsTitle?: string;
  featuredProductsDescription?: string;
  featuredProducts?: EditorialFeaturedProduct[];
  actions: EditorialAction[];
};

import {
  SITE_COLLECTIONS,
  SITE_RESOURCE_GUIDES,
  TRACK_ORDER_URL,
  buildCollectionRoute,
  buildResourceRoute,
  buildResourceTopicRoute,
  buildSearchQueryUrl,
  buildSubcollectionRoute,
  getCollectionByHandle,
  getResourceByHandle,
  getResourceTopicByHandle,
  getSubcollectionByHandle,
} from "@/lib/site-navigation";
import { RESOURCE_HUB_HUB_FEATURED_PRODUCTS } from "@/lib/resource-hub-data";

function buildCollectionPageContent(collectionHandle: string): EditorialPageContent | null {
  const collection = getCollectionByHandle(collectionHandle);
  if (!collection) {
    return null;
  }

  return {
    handle: collection.handle,
    kicker: "Collections",
    title: collection.title,
    summary: collection.summary,
    stats: [
      { label: "Subcollections", value: String(collection.subcollections.length) },
      { label: "Browse path", value: "Guided" },
      { label: "Shop cue", value: "Search friendly" },
    ],
    accent: collection.accent,
    introParagraphs: [
      `${collection.summary} The collection page keeps the entry point clean, then branches into focused subcollections so shoppers can narrow the browse without starting over.`,
      `Use the subcategory links below to open the most relevant version of ${collection.title.toLowerCase()} or jump straight into a search path that matches the intent of the page.`,
    ],
    cardsTitle: "Subcollections",
    cardsDescription: "Use these pages to keep the browse tight and specific.",
    cards: collection.subcollections.map((subcollection) => ({
      title: subcollection.title,
      detail: subcollection.summary,
      to: buildSubcollectionRoute(collection.handle, subcollection.handle),
    })),
    chipsTitle: "Browse cues",
    chipsDescription: "The search phrase behind this collection page.",
    chips: collection.subcollections.map((subcollection) => subcollection.title),
    actions: [
      {
        label: `Search ${collection.title}`,
        to: buildSearchQueryUrl(collection.searchQuery),
        primary: true,
      },
      { label: "Resource Hub", to: "/shop?resource=hub" },
      { label: "All collections", to: "/collections" },
    ],
  };
}

function buildSubcollectionPageContent(collectionHandle: string, subcollectionHandle: string): EditorialPageContent | null {
  const collection = getCollectionByHandle(collectionHandle);
  if (!collection) {
    return null;
  }

  const subcollection = getSubcollectionByHandle(collectionHandle, subcollectionHandle);
  if (!subcollection) {
    return null;
  }

  const siblingCards = collection.subcollections
    .filter((entry) => entry.handle !== subcollection.handle)
    .slice(0, 4)
    .map((entry) => ({
      title: entry.title,
      detail: entry.summary,
      to: buildSubcollectionRoute(collection.handle, entry.handle),
    }));

  return {
    handle: `${collection.handle}/${subcollection.handle}`,
    kicker: collection.title,
    title: subcollection.title,
    summary: subcollection.summary,
    stats: [
      { label: "Parent", value: collection.title },
      { label: "Intent", value: "Focused browse" },
      { label: "Search cue", value: "Editorial" },
    ],
    accent: {
      label: "Focused browse",
      title: `${subcollection.title} inside ${collection.title}`,
      body:
        subcollection.summary +
        " Use this page when the shopper already knows the aisle and wants a quicker route into a narrower, more relevant browse.",
      bullets: [subcollection.title, collection.title, "Search-supported route"],
    },
    introParagraphs: [
      `This subcollection page keeps the browsing intent tight so the shopper can move from a broad category into a more specific need without losing context.`,
      `If the exact product is not in view yet, the linked search path and sibling pages below still preserve the intended route through the catalog.`,
    ],
    cardsTitle: "Related subcollections",
    cardsDescription: "Branch sideways to keep the browse relevant.",
    cards: siblingCards,
    chipsTitle: "Key search cues",
    chipsDescription: "Terms and ideas that describe the page.",
    chips: [subcollection.title, ...subcollection.searchQuery.split(" ").slice(0, 5)],
    actions: [
      {
        label: `Back to ${collection.title}`,
        to: buildCollectionRoute(collection.handle),
        primary: true,
      },
      { label: "Search this topic", to: buildSearchQueryUrl(subcollection.searchQuery) },
      { label: "Collections index", to: "/collections" },
    ],
  };
}

function buildCollectionsIndexPageContent(): EditorialPageContent {
  return {
    handle: "collections",
    kicker: "Collections",
    title: "Shop the SALT collection families",
    summary:
      "A clean index for the new collection structure, with the main routes and their subcategories laid out so shoppers can move faster.",
    stats: [
      { label: "Main collections", value: String(SITE_COLLECTIONS.length) },
      { label: "Navigation", value: "Dropdown ready" },
      { label: "Purpose", value: "SEO and clarity" },
    ],
    accent: {
      label: "Collection index",
      title: "Eight main collection families, one consistent structure",
      body:
        "This page is the central directory for the new collection architecture. Each card links to a main collection landing page, and the subcategory links underneath keep the browse precise.",
      bullets: ["Main collection pages", "Subcollection drill-downs", "Search-friendly routes"],
    },
    introParagraphs: [
      "The store now uses a collection map that is easier to scan from the header and easier to explain to search engines.",
      "Open a main collection to read the overview, or use a subcategory link to go one layer deeper into the exact shopping intent.",
    ],
    cardsTitle: "Main collections",
    cardsDescription: "Each main collection carries its own supporting subcategory pages.",
    cards: SITE_COLLECTIONS.map((collection) => ({
      title: collection.title,
      detail: collection.summary,
      to: buildCollectionRoute(collection.handle),
    })),
    chipsTitle: "Subcategories at a glance",
    chipsDescription: "The collection families are connected to the exact dropdown routes used in the header.",
    chips: SITE_COLLECTIONS.flatMap((collection) =>
      collection.subcollections.slice(0, 2).map((subcollection) => `${collection.title}: ${subcollection.title}`),
    ),
    actions: [
      { label: "Resource Hub", to: "/shop?resource=hub", primary: true },
      { label: "Search the catalog", to: "/shop" },
      { label: "Contact support", to: "/pages/contact-us" },
    ],
  };
}

type ResourcePageKind = "hub" | "category" | "topic";

function getCollectionTitleFromRoute(collectionRoute?: string | null): string {
  const rawHandle = String(collectionRoute || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^collections\//, "");
  if (!rawHandle) {
    return "";
  }

  return getCollectionByHandle(rawHandle)?.title || rawHandle.replace(/-/g, " ");
}

export function buildResourceReason(productTitle: string, pageTitle: string): string {
  const title = productTitle.toLowerCase();
  const page = pageTitle.toLowerCase();
  if (/\b(planner|tracker|journal|bloom)\b/.test(title)) {
    return `Supports the planning and reflection angle behind ${page}.`;
  }
  if (/\b(pill|medication|medical)\b/.test(title)) {
    return "Makes medication or essentials easier to keep in one place.";
  }
  if (/\b(night light|lamp|clock)\b/.test(title)) {
    return "Supports safer evenings and a calmer room at home.";
  }
  if (/\b(diffuser|humidifier|hot water|hand warmer)\b/.test(title)) {
    return "Adds a comfort-first self-care layer without feeling overdone.";
  }
  if (/\b(pet|dog|cat|harness|brush|water bottle|poop bags)\b/.test(title)) {
    return "Fits the pet-care route and keeps the routine simple.";
  }
  if (/\b(cookware|bowl|cup|opener|pump)\b/.test(title)) {
    return "Works well for daily use and giftable household upgrades.";
  }
  if (/\b(storage|bag|stand|toilet)\b/.test(title)) {
    return "Helps the home feel easier to organize and maintain.";
  }
  if (/\b(walking stick|cane)\b/.test(title)) {
    return "Adds a practical comfort-and-support signal for older adults.";
  }
  if (/\b(book|legacy)\b/.test(title)) {
    return "Reinforces the legacy and memory-preservation theme.";
  }

  return `Strong supporting pick for ${page}.`;
}

function buildResourceIntroParagraphs(kind: ResourcePageKind, summary: string, collectionTitle: string): string[] {
  if (kind === "hub") {
    return [
      "People usually arrive here with a task, not a category name. Pick the card that matches the job you want done, then move to the guide or topic page that feels closest.",
      "The page stays focused on one thing at a time so shoppers can get to the right answer quickly instead of reading through a long, generic directory.",
    ];
  }

  if (kind === "category") {
    return [
      summary,
      `This category landing page keeps the browse broad enough to explain the topic, but narrow enough to send readers into the exact subtopic they need next.`,
    ];
  }

  return [
    summary,
    `This topic page is intentionally focused so it can answer the question in plain language, then move the reader toward a matching SALT collection or product.`,
  ];
}

function buildResourceFaqs(kind: ResourcePageKind, title: string, categoryTitle?: string): EditorialFaq[] {
  if (kind === "hub") {
    return [
      {
        question: "What is the Resource Hub for?",
        answer:
          "It gives shoppers a fast place to start when they have a problem to solve but do not yet know the exact product or guide they need.",
      },
      {
        question: "How should someone move through the hub?",
        answer:
          "Pick the card that matches the task, open the guide, then move into the topic page if the question needs a more specific answer.",
      },
      {
        question: "Why does this format work for AEO and GEO?",
        answer:
          "The pages answer the question first, stay narrow, and connect each answer to real product pages and collections people can click next.",
      },
    ];
  }

  if (kind === "category") {
    return [
      {
        question: `What does ${title} help me solve?`,
        answer: "It turns a broad shopping or planning need into a clearer route, so the reader can move from curiosity to a practical next step.",
      },
      {
        question: "Which page should I open after this one?",
        answer: "Open the most relevant subtopic page inside the category, then use the collection link if you want to browse products directly.",
      },
      {
        question: "How many products should this page feature?",
        answer: "Three strong examples are enough; that keeps the page useful without turning it into a noisy catalog dump.",
      },
    ];
  }

  const scope = categoryTitle || "this category";
  return [
    {
      question: `What should someone look for in ${scope}?`,
      answer:
        "Start with the easiest win inside the category, then move into the subtopic that best matches the problem, budget, or routine.",
    },
    {
      question: `How do I choose the right subtopic inside ${scope}?`,
      answer:
        "Pick the version of the category that matches the shopper's situation most closely, then use the product picks as a practical next step.",
    },
    {
      question: `What should ${scope} link to next?`,
      answer:
        "Link to the parent category, one sibling topic, the most relevant collection route, and the first product in the featured set.",
    },
  ];
}

function buildResourceActions(kind: ResourcePageKind, collectionRoute: string): EditorialAction[] {
  if (kind === "hub") {
    return [
      { label: "Browse the guides", to: "/shop?resource=hub", primary: true },
      { label: "Shop the catalog", to: "/shop" },
      { label: "Contact us", to: "/pages/contact-us" },
    ];
  }

  const collectionTitle = getCollectionTitleFromRoute(collectionRoute);
  return [
    { label: `Shop ${collectionTitle || "collection"}`, to: collectionRoute, primary: true },
    { label: "Resource Hub", to: "/shop?resource=hub" },
    { label: "Contact us", to: "/pages/contact-us" },
  ];
}

function buildResourceAccent(kind: ResourcePageKind, title: string, summary: string, collectionTitle: string): EditorialPageContent["accent"] {
  if (kind === "hub") {
    return {
      label: "Why this exists",
      title: "Built for people who need a clear next step",
      body:
        "The Resource Hub gives shoppers and AI search engines one calm place to start. Each page answers one question, stays focused, and points to a real next click.",
      bullets: [],
    };
  }

  if (kind === "category") {
    return {
      label: "Category overview",
      title: `Explore ${title} without losing the thread`,
      body:
        summary +
        ` The category page keeps the route centered on ${collectionTitle || "the related collection"} so readers can move from a broad question into a tighter topic without restarting their search.`,
      bullets: [
        `${collectionTitle || title} collection route`,
        "Topic drill-downs",
        "Three featured products",
      ],
    };
  }

  return {
    label: "Guide overview",
    title: `What shoppers need to know about ${title.toLowerCase()}`,
    body:
      summary +
      " The page is written to answer common pre-purchase questions quickly and point readers toward the most relevant collection family.",
    bullets: [
      `Focused ${collectionTitle || "collection"} context`,
      "Clear answer first",
      "Real product picks",
    ],
  };
}

function buildResourceChips(
  kind: ResourcePageKind,
  titles: string[],
  collectionTitle?: string,
): string[] {
  if (kind === "hub") {
    return titles;
  }

  if (kind === "category") {
    return titles;
  }

  return [...titles.slice(0, 2), collectionTitle || "Collection", "Practical tips", "Product picks"];
}

function buildResourceFeaturedProducts(
  featuredProducts: EditorialPageContent["featuredProducts"] | undefined,
  collectionRoute?: string | null,
): EditorialFeaturedProduct[] {
  const collectionLabel = getCollectionTitleFromRoute(collectionRoute);
  return (
    featuredProducts?.map((product) => ({
      handle: product.handle,
      collectionLabel: collectionLabel || undefined,
    })) || []
  );
}

function buildResourceHubPageContent(): EditorialPageContent {
  return {
    handle: "resources",
    kicker: "Resource Hub",
    title: "Resource Hub",
    seoTitle: "Resource Hub | SALT Online Store",
    metaDescription: "Pick the question you're trying to answer, then jump into the guide or topic page that fits it best.",
    summary: "Pick the question you're trying to answer, then jump into the guide or topic page that fits it best.",
    stats: [
      { label: "Guides", value: String(SITE_RESOURCE_GUIDES.length) },
      { label: "Goal", value: "Answer-first" },
      { label: "Format", value: "Editorial" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Resource Hub" },
    ],
    accent: buildResourceAccent("hub", "Resource Hub", "", ""),
    introParagraphs: buildResourceIntroParagraphs("hub", "Use the hub when the shopper wants advice first and a product second.", ""),
    cardsTitle: "Choose your path",
    cardsDescription: "Start from the task, not the category label.",
    cards: SITE_RESOURCE_GUIDES.map((guide) => ({
      title: guide.title,
      detail: guide.summary,
      to: buildResourceRoute(guide.handle),
    })),
    chipsTitle: "Search cues",
    chipsDescription: "The topics behind the hub pages.",
    chips: buildResourceChips("hub", SITE_RESOURCE_GUIDES.map((guide) => guide.title)),
    featuredProductsTitle: "Useful starting products",
    featuredProductsDescription: "A calm cross-category set that represents the hub's most useful routes.",
    featuredProducts: RESOURCE_HUB_HUB_FEATURED_PRODUCTS.map((product) => ({
      handle: product.handle,
    })),
    faqsTitle: "Common questions",
    faqsDescription: "Short answers that help shoppers and answer engines move faster.",
    faqs: buildResourceFaqs("hub", "Resource Hub"),
    actions: buildResourceActions("hub", ""),
  };
}

function buildResourceCategoryPageContent(guide: SiteResourceGuide): EditorialPageContent {
  const collectionTitle = getCollectionTitleFromRoute(guide.collectionRoute);
  return {
    handle: guide.handle,
    kicker: "Resource Hub",
    title: guide.title,
    seoTitle: `${guide.title} | SALT Resource Hub`,
    metaDescription: `${guide.summary} Explore the related collection, compare the topic pages, and use the product picks to move from research to shopping.`,
    summary: guide.summary,
    stats: [
      { label: "Topics", value: String(guide.topics.length) },
      { label: "Collection", value: collectionTitle || "Editorial route" },
      { label: "Intent", value: "AEO / GEO" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Resource Hub", to: "/shop?resource=hub" },
      { label: guide.title },
    ],
    accent: buildResourceAccent("category", guide.title, guide.summary, collectionTitle),
    introParagraphs: buildResourceIntroParagraphs("category", guide.summary, collectionTitle),
    cardsTitle: "Topic pages",
    cardsDescription: "Open the question that matches the shopper's intent.",
    cards: guide.topics.map((topic) => ({
      title: topic.title,
      detail: topic.summary,
      to: buildResourceTopicRoute(guide.handle, topic.handle),
    })),
    chipsTitle: "Topic cues",
    chipsDescription: "The subtopics behind this category.",
    chips: buildResourceChips("category", guide.topics.map((topic) => topic.title)),
    featuredProductsTitle: "Featured products",
    featuredProductsDescription: "Three real products that match the category intent and link back to live store pages.",
    featuredProducts: buildResourceFeaturedProducts(guide.featuredProducts, guide.collectionRoute),
    faqsTitle: "Frequently asked",
    faqsDescription: "Short answers that support shopping without losing the editorial thread.",
    faqs: buildResourceFaqs("category", guide.title),
    actions: buildResourceActions("category", guide.collectionRoute),
  };
}

function buildResourceTopicPageContent(guide: SiteResourceGuide, topic: SiteResourceGuide["topics"][number]): EditorialPageContent {
  const collectionTitle = getCollectionTitleFromRoute(topic.collectionRoute);
  const siblingTopics = guide.topics.filter((entry) => entry.handle !== topic.handle).slice(0, 4);

  return {
    handle: `${guide.handle}/${topic.handle}`,
    kicker: guide.title,
    title: topic.title,
    seoTitle: `${topic.title} | ${guide.title} | SALT Resource Hub`,
    metaDescription: `${topic.summary} Use the collection route, sibling guides, and featured products to answer the question with a clear next step.`,
    summary: topic.summary,
    stats: [
      { label: "Topic", value: topic.title },
      { label: "Collection", value: collectionTitle || "Editorial route" },
      { label: "Intent", value: "Focused browse" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Resource Hub", to: "/shop?resource=hub" },
      { label: guide.title, to: buildResourceRoute(guide.handle) },
      { label: topic.title },
    ],
    accent: buildResourceAccent("topic", topic.title, topic.summary, collectionTitle),
    introParagraphs: buildResourceIntroParagraphs("topic", topic.summary, collectionTitle),
    cardsTitle: "Related topics",
    cardsDescription: "Branch sideways to keep the browse relevant.",
    cards: siblingTopics.map((siblingTopic) => ({
      title: siblingTopic.title,
      detail: siblingTopic.summary,
      to: buildResourceTopicRoute(guide.handle, siblingTopic.handle),
    })),
    chipsTitle: "Key search cues",
    chipsDescription: "The language this page is built to answer.",
    chips: buildResourceChips("topic", [guide.title, topic.title], collectionTitle),
    featuredProductsTitle: "Featured products",
    featuredProductsDescription: "Three useful products that fit the question and keep the path grounded in the real catalog.",
    featuredProducts: buildResourceFeaturedProducts(topic.featuredProducts, topic.collectionRoute),
    faqsTitle: "Frequently asked",
    faqsDescription: "Short answers that reduce friction before the shopper moves on.",
    faqs: buildResourceFaqs("topic", topic.title, guide.title),
    actions: buildResourceActions("topic", topic.collectionRoute),
  };
}

function buildFaqPageContent(): EditorialPageContent {
  return {
    handle: "faq",
    kicker: "Support",
    title: "FAQ",
    summary: "Quick answers to the most common store and shipping questions.",
    stats: [
      { label: "Focus", value: "Fast answers" },
      { label: "Use case", value: "Pre-purchase help" },
      { label: "Format", value: "FAQ" },
    ],
    accent: {
      label: "Need to know",
      title: "Short answers for faster decisions",
      body:
        "Use this page when a shopper needs clarification on ordering, shipping, returns, or where to start. The answer cards are designed to reduce friction before support needs to step in.",
      bullets: ["Ordering help", "Shipping basics", "Returns and support"],
    },
    introParagraphs: [
      "The FAQ page keeps common support questions close to the shopping journey so people can solve small doubts without leaving the store.",
      "If a question is not covered here, the contact page and order tracking link stay close by in the footer.",
    ],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers people usually need before they order.",
    faqs: [
      {
        question: "How do I find the right collection?",
        answer:
          "Start from the Collections index or the header dropdown, then narrow into the subcategory that matches the shopping intent.",
      },
      {
        question: "How do I check my order?",
        answer:
          `Use the Track Order link in the footer or open the Shopify customer portal: ${TRACK_ORDER_URL}.`,
      },
      {
        question: "Where is shipping and return information?",
        answer:
          "Shipping, return, and privacy details are available in the footer policy section and remain synced to the current store setup.",
      },
      {
        question: "What should I do if I still need help?",
        answer: "Use the Contact Us link for a support message and the team can route the request cleanly.",
      },
    ],
    actions: [
      { label: "Contact Us", to: "/pages/contact-us", primary: true },
      { label: "Track order", href: TRACK_ORDER_URL },
      { label: "Shipping policy", to: "/shipping-policy" },
    ],
  };
}

function buildContactPageContent(): EditorialPageContent {
  return {
    handle: "contact",
    kicker: "Support",
    title: "Need help with your order?",
    summary: "Reach the SALT support team for delivery questions, product advice, returns, or order help.",
    stats: [
      { label: "Response", value: "Within 24 business hours" },
      { label: "Use case", value: "Message support" },
      { label: "Format", value: "Human routed" },
    ],
    accent: {
      label: "Direct help",
      title: "Fast, clear, and helpful responses",
      body:
        "We route messages with context, not templates. A few details about the order or product help the team reply faster.",
      bullets: ["Delivery updates", "Return checks", "Order help"],
    },
    introParagraphs: [
      "Use this page when the answer needs a person. Keep the message focused on the order, product, or delivery issue and the team can route it cleanly.",
      "If the request only needs a quick lookup, the FAQ and order tracking pages stay close by in the support flow.",
    ],
    cardsTitle: "Fast routes",
    cardsDescription: "Use these shortcuts when the answer lives on a policy or order page.",
    cards: [
      { title: "FAQ", detail: "Short answers for ordering and shipping.", to: "/pages/faq" },
      { title: "Track order", detail: "Open the secure order portal.", to: "/track-order" },
      { title: "Shipping policy", detail: "Review delivery timing and fulfillment notes.", to: "/shipping-policy" },
      { title: "Refund policy", detail: "See returns and refund terms.", to: "/refund-policy" },
    ],
    chipsTitle: "Common topics",
    chipsDescription: "The most common reasons people reach out.",
    chips: ["Order tracking", "Returns and exchanges", "Product recommendation", "Bulk order request"],
    actions: [
      { label: "Message us", href: "#support-message", primary: true },
      { label: "Track order", href: TRACK_ORDER_URL },
      { label: "FAQ", to: "/pages/faq" },
    ],
  };
}

function buildWholesalePageContent(): EditorialPageContent {
  return {
    handle: "wholesale-inquiries",
    kicker: "Wholesale",
    title: "Wholesale Inquiries",
    summary:
      "Reach out for bulk, retail, partnership, or sourcing discussions with a simple, direct route into the team.",
    stats: [
      { label: "Audience", value: "Retail partners" },
      { label: "Use case", value: "Bulk orders" },
      { label: "Response", value: "Support routed" },
    ],
    accent: {
      label: "Wholesale support",
      title: "Built for direct conversations, not cluttered forms",
      body:
        "The wholesale page keeps the path simple: what you need, how many units you want, and what timeline you are trying to hit.",
      bullets: ["Bulk buying", "Partnership questions", "Retail sourcing"],
    },
    introParagraphs: [
      "Use this page for wholesale, retail, or partnership questions that need a human response instead of a standard product browse.",
      "The goal is to collect enough context to route the request quickly and keep the conversation focused.",
    ],
    cardsTitle: "What to include",
    cardsDescription: "A few details help the team answer faster.",
    cards: [
      {
        title: "Product focus",
        detail: "Tell us which collection or product family you want to discuss.",
      },
      {
        title: "Estimated quantity",
        detail: "Share the approximate bulk order size or retail rollout volume.",
      },
      {
        title: "Timeline",
        detail: "Let us know if you are planning an event, launch, or seasonal refresh.",
      },
      {
        title: "Contact info",
        detail: "Include the best email address so the team can reply cleanly.",
      },
    ],
    chipsTitle: "Common requests",
    chipsDescription: "Typical reasons people contact wholesale support.",
    chips: ["Bulk orders", "Retail partnerships", "Product sourcing", "Store rollouts", "Seasonal buys"],
    actions: [
      { label: "Contact Us", to: "/pages/contact-us", primary: true },
      { label: "Browse collections", to: "/collections" },
      { label: "Resource Hub", to: "/shop?resource=hub" },
    ],
  };
}

function buildTermsConditionsPageContent(): EditorialPageContent {
  return {
    handle: "terms-conditions",
    kicker: "Legal",
    title: "Terms & Conditions",
    summary:
      "A concise terms page for how the store operates, what shoppers can expect, and where the support boundaries live.",
    stats: [
      { label: "Topic", value: "Store terms" },
      { label: "Use case", value: "Policy reference" },
      { label: "Format", value: "Editorial" },
    ],
    accent: {
      label: "Store terms",
      title: "Simple terms, written for humans",
      body:
        "This page is designed to give shoppers a clear reference for store use, order behavior, and support expectations without making them hunt through the footer.",
      bullets: ["Store use", "Orders and checkout", "Support boundaries"],
    },
    introParagraphs: [
      "Terms pages work best when they are readable and direct, so the store keeps this page short and easy to scan.",
      "If you need shipping, return, or privacy details, those policy pages remain available in the footer next to this one.",
    ],
    cardsTitle: "Related policies",
    cardsDescription: "Keep the legal references grouped together.",
    cards: [
      { title: "Shipping policy", detail: "Delivery timing and fulfillment details.", to: "/shipping-policy" },
      { title: "Return policy", detail: "Refund and return expectations.", to: "/refund-policy" },
      { title: "Privacy policy", detail: "How customer data is handled.", to: "/privacy-policy" },
    ],
    chipsTitle: "Reference points",
    chipsDescription: "The legal topics covered by the page.",
    chips: ["Orders", "Checkout", "Store use", "Customer support", "Policy reference"],
    actions: [
      { label: "Contact Us", to: "/pages/contact-us", primary: true },
      { label: "FAQ", to: "/pages/faq" },
      { label: "Track order", href: TRACK_ORDER_URL },
    ],
  };
}

function buildTrackOrderPageContent(): EditorialPageContent {
  return {
    handle: "track-order",
    kicker: "Orders",
    title: "Track Order",
    summary: "Open the Shopify order portal to review your order history and shipment progress.",
    stats: [
      { label: "Portal", value: "Shopify" },
      { label: "Access", value: "Secure" },
      { label: "Use case", value: "Order lookup" },
    ],
    accent: {
      label: "Order portal",
      title: "Use the customer account flow to check orders",
      body:
        "This page exists as a simple bridge into the Shopify account order view, so shoppers have one obvious place to click when they need tracking help.",
      bullets: ["Order status", "Shipping progress", "Account history"],
    },
    introParagraphs: [
      "If you placed an order and want to review the current status, use the portal link below.",
      "For product questions, shipping concerns, or anything that needs a person, the Contact Us page stays available in the footer.",
    ],
    cardsTitle: "Useful next steps",
    cardsDescription: "If tracking is not enough, keep the support flow moving.",
    cards: [
      { title: "FAQ", detail: "Common order and store questions.", to: "/pages/faq" },
      { title: "Contact Us", detail: "Send the support team a message.", to: "/pages/contact-us" },
      { title: "Shipping policy", detail: "Review shipping timing and terms.", to: "/shipping-policy" },
    ],
    chipsTitle: "What you can review",
    chipsDescription: "Order tasks handled by the Shopify portal.",
    chips: ["Order status", "Shipping updates", "History", "Account access"],
    actions: [
      { label: "Open Shopify orders", href: TRACK_ORDER_URL, primary: true },
      { label: "Contact Us", to: "/pages/contact-us" },
    ],
  };
}

const resourceEditorialPages: Record<string, EditorialPageContent> = {
  resources: buildResourceHubPageContent(),
  ...Object.fromEntries(
    SITE_RESOURCE_GUIDES.map((guide) => [guide.handle, buildResourceCategoryPageContent(guide)]),
  ),
  ...Object.fromEntries(
    SITE_RESOURCE_GUIDES.flatMap((guide) =>
      guide.topics.map((topic) => [
        `${guide.handle}/${topic.handle}`,
        buildResourceTopicPageContent(guide, topic),
      ]),
    ),
  ),
};

const editorialPages: Record<string, EditorialPageContent> = {
  "about-us": {
    handle: "about-us",
    kicker: "About SALT",
    title: "About SALT Online Store",
    summary:
      "Founded in 2024 as an extension of Senior and Living Today Services, LLC, SALT supports seniors, caregivers, and families with practical products and a calmer shopping experience.",
    stats: [
      { label: "Founded", value: "2024" },
      { label: "Brand home", value: "Senior and Living Today Services, LLC" },
      { label: "Founder", value: "Courtney R. Jones" },
    ],
    accent: {
      label: "Why SALT exists",
      title: "Built from care, not commodity",
      body:
        "The store grew out of senior care experience and the Living Legacy Planner® mindset. The goal is simple: make useful products easier to find and easier to trust.",
      bullets: ["Thoughtful curation", "Family-friendly support", "Practical everyday value"],
    },
    introParagraphs: [
      "SALT began as a mission-led extension of Senior and Living Today Services, LLC. The store is shaped to help people find products that feel useful, giftable, and easy to choose.",
      "Courtney R. Jones founded the brand around the same care-first approach behind the Living Legacy Planner®. That mindset shows up in the catalog, the navigation, and the way the store stays focused on real-life needs.",
    ],
    cardsTitle: "What we offer",
    cardsDescription:
      "A small set of useful categories, chosen to feel practical, giftable, and easy to browse.",
    cards: [
      {
        title: "Home Decor",
        detail: "Warm accents, lighting, and everyday pieces that make a space feel complete.",
        to: "/collections/home-decor",
      },
      {
        title: "Fashion & Apparel",
        detail: "Comfortable, seasonal basics with easy styling and everyday wearability.",
        to: "/collections/dresses",
      },
      {
        title: "Gardening Tools",
        detail: "Durable tools and helpers built for steady, practical use.",
        to: "/collections/garden-tools",
      },
      {
        title: "Pet Care",
        detail: "Convenient accessories that support pets and the people who care for them.",
        to: "/collections/pet-assocerries",
      },
      {
        title: "Cookware & Kitchen Essentials",
        detail: "Space-saving kitchen finds and dependable tools for daily routines.",
        to: "/collections/cookware",
      },
    ],
    chipsTitle: "Why people stay",
    chipsDescription: "The store stays simple, useful, and welcoming.",
    chips: [
      "Free U.S. shipping",
      "Unique products",
      "Fresh arrivals weekly",
      "Easy-to-trust checkout",
      "Family of brands",
    ],
    actions: [
      { label: "Shop the catalog", to: "/shop", primary: true },
      { label: "View mission", to: "/pages/mission-vision" },
      { label: "Affiliate program", to: "/pages/affiliate-program" },
    ],
  },
  "mission-vision": {
    handle: "mission-vision",
    kicker: "Mission & Vision",
    title: "Our Mission & Vision",
    summary:
      "We exist to enrich the lives of seniors, caregivers, and families with trusted products, helpful resources, and meaningful solutions.",
    stats: [
      { label: "Mission", value: "Serve with care" },
      { label: "Vision", value: "Trusted resource in America" },
      { label: "Values", value: "Compassion-led" },
    ],
    accent: {
      label: "What guides the brand",
      title: "Compassion, integrity, service",
      body:
        "SALT is built to feel helpful first. Every choice should support the customer, respect the family, and keep the shopping experience clear.",
      bullets: ["Education over noise", "Community over clutter", "Trust over hype"],
    },
    introParagraphs: [
      "Our mission is to enrich the lives of seniors, caregivers, and families with trusted products, resources, and meaningful solutions.",
      "Our vision is to become a trusted resource in America for people who want the right product and the right guidance without extra friction.",
    ],
    cardsTitle: "What we stand for",
    cardsDescription: "The store is guided by the same values in every category and every page.",
    cards: [
      {
        title: "Compassion",
        detail: "Lead with care, patience, and respect for real-life needs.",
      },
      {
        title: "Integrity",
        detail: "Keep the store honest, clear, and dependable.",
      },
      {
        title: "Service",
        detail: "Make every interaction easier to understand and easier to trust.",
      },
    ],
    chipsTitle: "Core values",
    chipsDescription: "The brand stays rooted in people, not clutter.",
    chips: ["Compassion", "Integrity", "Service", "Education", "Family", "Community"],
    actions: [
      { label: "About SALT", to: "/pages/about-us", primary: true },
      { label: "Contact support", to: "/pages/contact-us" },
      { label: "Shop the catalog", to: "/shop" },
    ],
  },
  "affiliate-program": {
    handle: "affiliate-program",
    kicker: "Affiliate Program",
    title: "SALT Affiliate Partner Program",
    summary:
      "Join free, share products you believe in, and earn income while supporting a mission-led store.",
    stats: [
      { label: "Join", value: "Free" },
      { label: "Payouts", value: "Twice monthly" },
      { label: "Tracking", value: "Real time" },
    ],
    accent: {
      label: "Partner benefits",
      title: "Work from anywhere",
      body:
        "The program is built to stay simple: real-time tracking, clear dashboards, and a growth model that rewards consistent sharing.",
      bullets: ["No upfront fee", "Unlimited earning potential", "Mission-aligned brand"],
    },
    introParagraphs: [
      "The SALT Affiliate Partner Program lets creators, advocates, and partners earn income while supporting the store's mission.",
      "It is free to join, designed to work from anywhere, and built around clear tracking so partners can see what is happening at a glance.",
    ],
    stepsTitle: "How it works",
    stepsDescription: "Five simple steps from signup to payout.",
    steps: [
      {
        step: "01",
        title: "Join free",
        detail: "Send your information and get set up as a SALT affiliate partner.",
      },
      {
        step: "02",
        title: "Share links",
        detail: "Promote products that feel useful, giftable, and aligned with your audience.",
      },
      {
        step: "03",
        title: "Track activity",
        detail: "Use the dashboard to monitor clicks, conversions, and commissions in real time.",
      },
      {
        step: "04",
        title: "Earn commissions",
        detail: "Qualifying referrals convert into earnings without extra friction.",
      },
      {
        step: "05",
        title: "Get paid twice monthly",
        detail: "Reliable payouts keep the partnership simple and predictable.",
      },
    ],
    cardsTitle: "Program benefits",
    cardsDescription: "The program is set up to stay clear and practical for partners.",
    cards: [
      {
        title: "Free to join",
        detail: "No upfront fee to become a partner.",
      },
      {
        title: "Real-time tracking",
        detail: "See performance without waiting for manual updates.",
      },
      {
        title: "Work from anywhere",
        detail: "Promote on your own schedule from any location.",
      },
      {
        title: "Unlimited earning potential",
        detail: "Income can grow with the reach and relevance of your content.",
      },
    ],
    faqsTitle: "Frequently asked",
    faqsDescription: "Quick answers for new partners.",
    faqs: [
      {
        question: "Is there a cost to join?",
        answer: "No. Joining the program is free.",
      },
      {
        question: "How often are payouts made?",
        answer: "Payouts are processed twice monthly.",
      },
      {
        question: "Do I need a large audience?",
        answer: "No. Partners can grow at their own pace and promote products that fit their audience.",
      },
      {
        question: "Can I check performance in real time?",
        answer: "Yes. The program includes a tracking dashboard so you can watch activity as it happens.",
      },
    ],
    actions: [
      { label: "Contact the team", to: "/pages/contact-us", primary: true },
      { label: "About SALT", to: "/pages/about-us" },
      { label: "Mission & Vision", to: "/pages/mission-vision" },
    ],
  },
  collections: buildCollectionsIndexPageContent(),
  resources: buildResourceHubPageContent(),
  contact: buildContactPageContent(),
  faq: buildFaqPageContent(),
  "wholesale-inquiries": buildWholesalePageContent(),
  "terms-conditions": buildTermsConditionsPageContent(),
  "track-order": buildTrackOrderPageContent(),
  ...Object.fromEntries(
    SITE_COLLECTIONS.map((collection) => [
      collection.handle,
      buildCollectionPageContent(collection.handle)!,
    ]),
  ),
  ...Object.fromEntries(
    SITE_COLLECTIONS.flatMap((collection) =>
      collection.subcollections.map((subcollection) => [
        `${collection.handle}/${subcollection.handle}`,
        buildSubcollectionPageContent(collection.handle, subcollection.handle)!,
      ]),
    ),
  ),
  ...resourceEditorialPages,
};

export function getEditorialPageContent(handle: string): EditorialPageContent | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    return null;
  }

  const directMatch = editorialPages[normalizedHandle];
  if (directMatch) {
    return directMatch;
  }

  const [resourceCategorySegment, resourceTopicSegment] = normalizedHandle.split("/", 2);
  if (resourceCategorySegment && resourceTopicSegment) {
    const resourceGuide = getResourceByHandle(resourceCategorySegment);
    const resourceTopic = resourceGuide ? getResourceTopicByHandle(resourceCategorySegment, resourceTopicSegment) : null;
    if (resourceGuide && resourceTopic) {
      return editorialPages[`${resourceGuide.handle}/${resourceTopic.handle}`] || null;
    }
  }

  const collectionMatch = getCollectionByHandle(normalizedHandle);
  if (collectionMatch) {
    return editorialPages[collectionMatch.handle] || null;
  }

  const [collectionSegment, subcollectionSegment] = normalizedHandle.split("/", 2);
  if (collectionSegment && subcollectionSegment) {
    const nestedCollection = getCollectionByHandle(collectionSegment);
    const nestedSubcollection = nestedCollection ? getSubcollectionByHandle(collectionSegment, subcollectionSegment) : null;
    if (nestedCollection && nestedSubcollection) {
      return editorialPages[`${nestedCollection.handle}/${nestedSubcollection.handle}`] || null;
    }
  }

  return null;
}

export function listEditorialPages(): EditorialPageContent[] {
  return Object.values(editorialPages);
}
