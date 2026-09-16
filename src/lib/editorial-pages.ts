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

export type EditorialAnswerBlock = {
  question: string;
  answer: string;
  usefulFor: string;
  nextStep: string;
  takeaways?: string[];
  queryPrompts?: string[];
  decisionSteps?: EditorialStep[];
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
  answerBlock?: EditorialAnswerBlock;
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

export type EditorialPagePayload = {
  generatedAt: string;
  source: string;
  page: EditorialPageContent;
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
  type SiteResourceGuide,
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
      { label: "Resource Hub", to: "/pages/resources" },
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
      { label: "Resource Hub", to: "/pages/resources", primary: true },
      { label: "Search the catalog", to: "/shop" },
      { label: "Contact support", to: "/pages/contact-us" },
    ],
  };
}

type ResourcePageKind = "hub" | "category" | "topic";

function lowerFirst(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function buildResourceTopicQuestion(title: string): string {
  const cleanTitle = String(title || "").trim().replace(/[?!.]+$/g, "");
  const lowerTitle = lowerFirst(cleanTitle);
  const normalized = lowerTitle.toLowerCase();
  const explicitQuestions: Record<string, string> = {
    "simple habits for a less stressful life": "What simple habits can make life less stressful?",
    "family emergency preparedness": "How can I prepare my family for emergencies?",
    "caregiver resources": "What caregiver resources can help with daily routines?",
    "why every family should have important information organized":
      "Why should every family keep important information organized?",
  };

  if (explicitQuestions[normalized]) {
    return explicitQuestions[normalized];
  }

  if (/^best gifts\b/i.test(cleanTitle)) {
    return `What are the ${lowerTitle}?`;
  }
  if (/^how to\s+/i.test(cleanTitle)) {
    return `How can I ${lowerTitle.replace(/^how to\s+/i, "")}?`;
  }
  const actionTitle = lowerTitle.replace(
    /^(creating|making|preserving|planning|organizing|decluttering|keeping)\s+/i,
    (prefix) =>
      ({
        creating: "create ",
        making: "make ",
        preserving: "preserve ",
        planning: "plan ",
        organizing: "organize ",
        decluttering: "declutter ",
        keeping: "keep ",
      })[prefix.trim().toLowerCase()] || prefix,
  );
  if (actionTitle !== lowerTitle) {
    return /^(organize|declutter|keep)\b/i.test(actionTitle)
      ? `How do I ${actionTitle}?`
      : `How can I ${actionTitle}?`;
  }
  if (/\btips\b/i.test(cleanTitle)) {
    return `What are practical ${lowerTitle}?`;
  }
  if (/^self-care\b/i.test(cleanTitle)) {
    return `What are practical ${lowerTitle} ideas?`;
  }
  if (/^why\b/i.test(cleanTitle)) {
    return `${cleanTitle}?`;
  }

  return `What should I know about ${lowerTitle}?`;
}

function buildResourceQueryPrompts(
  kind: ResourcePageKind,
  title: string,
  collectionTitle = "",
): string[] {
  if (kind === "hub") {
    return [
      "What is the SALT Resource Hub?",
      "Which SALT guide should I open first?",
      "Where can I find practical product ideas for a specific need?",
    ];
  }

  const lowerTitle = lowerFirst(title);
  if (kind === "category") {
    return [
      `What does ${lowerTitle} cover?`,
      `What can I find in ${lowerTitle}?`,
      collectionTitle
        ? `Which SALT collection is related to ${lowerTitle}?`
        : `Which SALT products relate to ${lowerTitle}?`,
    ];
  }

  return [
    buildResourceTopicQuestion(title),
    "What should I compare before choosing a product?",
    collectionTitle
      ? "Which SALT collection is the next place to compare?"
      : `Where can I find practical products related to ${lowerTitle}?`,
  ];
}

function buildResourceDecisionSteps(kind: ResourcePageKind, collectionTitle = ""): EditorialStep[] {
  if (kind === "hub") {
    return [
      { step: "01", title: "Name the need", detail: "Start with the task, occasion, or routine you want to make easier." },
      { step: "02", title: "Narrow the question", detail: "Open the guide, then choose the topic that sounds closest to your situation." },
      { step: "03", title: "Check the live listing", detail: "Compare the linked product details, options, delivery terms, and returns before ordering." },
    ];
  }

  if (kind === "category") {
    return [
      { step: "01", title: "Choose a topic", detail: "Use the topic cards to move from a broad need to a more specific question." },
      {
        step: "02",
        title: "Compare the collection",
        detail: collectionTitle
          ? `Open ${collectionTitle} when you are ready to compare the current product range.`
          : "Open the linked collection when you are ready to compare the current product range.",
      },
      { step: "03", title: "Verify before buying", detail: "Review the live listing for price, availability, options, delivery, and returns." },
    ];
  }

  return [
    { step: "01", title: "Match the use case", detail: "Make sure the topic fits the person, room, occasion, or routine you have in mind." },
    {
      step: "02",
      title: "Compare real options",
      detail: collectionTitle
        ? `Use ${collectionTitle} and the featured product links to compare what is currently available.`
        : "Use the featured product links to compare what is currently available.",
    },
    { step: "03", title: "Confirm the details", detail: "Check the selected option, product information, delivery terms, and returns before ordering." },
  ];
}

function buildResourceTakeaways(
  kind: ResourcePageKind,
  title: string,
  summary: string,
  collectionTitle = "",
): string[] {
  if (kind === "hub") {
    return [
      "Start with the task, occasion, or routine—not a product name.",
      "Use a guide for broad context and a topic page for a focused question.",
      "Confirm current price, options, delivery, and returns on the linked live listing.",
    ];
  }

  if (kind === "category") {
    return [
      summary,
      "Choose the topic that matches the reader's situation before browsing the full catalog.",
      collectionTitle
        ? `Use the ${collectionTitle} collection to compare current product listings.`
        : "Use the linked product picks to compare current listings.",
    ];
  }

  return [
    summary,
    `Use this page as a focused starting point for ${title.toLowerCase()}, then follow the related routes.`,
    collectionTitle
      ? `Use the ${collectionTitle} collection to compare current products.`
      : "Review the live product details before choosing an item.",
  ];
}

function buildResourceDirectAnswer(
  kind: ResourcePageKind,
  title: string,
  summary: string,
  collectionTitle = "",
): string {
  if (kind === "hub") {
    return `${summary} Start with the guide that matches the task or occasion, then open a focused topic page before moving to the related collection or product.`;
  }

  if (kind === "category") {
    return `${summary} Use the topic pages to narrow the question, then compare the related ${collectionTitle || "live"} product listings when you are ready to shop.`;
  }

  return `${summary} Use the answer and topic links here as a focused starting point, then confirm the current product details, availability, delivery terms, and returns on the linked listing.`;
}

function buildResourceAnswerBlock(
  kind: ResourcePageKind,
  title: string,
  summary: string,
  collectionTitle = "",
): EditorialAnswerBlock {
  if (kind === "hub") {
    return {
      question: "Where should I start when I need a practical product answer?",
      answer: buildResourceDirectAnswer(kind, title, summary, collectionTitle),
      usefulFor: "Shoppers who know the task, occasion, or problem but not the exact product.",
      nextStep: "Choose a guide, then open the topic that matches the question.",
      takeaways: buildResourceTakeaways(kind, title, summary, collectionTitle),
      queryPrompts: buildResourceQueryPrompts(kind, title, collectionTitle),
      decisionSteps: buildResourceDecisionSteps(kind, collectionTitle),
    };
  }

  if (kind === "category") {
    return {
      question: `What does ${title} help me decide?`,
      answer: buildResourceDirectAnswer(kind, title, summary, collectionTitle),
      usefulFor: `Shoppers comparing ${title.toLowerCase()} ideas before opening a product page.`,
      nextStep: collectionTitle
        ? `Choose a topic, then compare the ${collectionTitle} collection.`
        : "Choose a topic, then review the featured product picks.",
      takeaways: buildResourceTakeaways(kind, title, summary, collectionTitle),
      queryPrompts: buildResourceQueryPrompts(kind, title, collectionTitle),
      decisionSteps: buildResourceDecisionSteps(kind, collectionTitle),
    };
  }

  return {
    question: buildResourceTopicQuestion(title),
    answer: buildResourceDirectAnswer(kind, title, summary, collectionTitle),
    usefulFor: `Shoppers looking for a focused ${title.toLowerCase()} starting point.`,
    nextStep: collectionTitle
      ? `Review the ${collectionTitle} collection and the featured product picks.`
      : "Review the featured product picks and related guides.",
    takeaways: buildResourceTakeaways(kind, title, summary, collectionTitle),
    queryPrompts: buildResourceQueryPrompts(kind, title, collectionTitle),
    decisionSteps: buildResourceDecisionSteps(kind, collectionTitle),
  };
}

function buildDefaultAnswerBlock(page: EditorialPageContent): EditorialAnswerBlock {
  const lowerTitle = lowerFirst(page.title);
  const question =
    page.handle === "faq"
      ? "What should I know before ordering from SALT?"
      : page.handle === "collections"
        ? "How should I choose a SALT collection?"
        : page.handle === "contact"
          ? "How can I get help from SALT?"
          : `What should I know about ${lowerTitle}?`;
  const nextAction = page.actions.find((action) => action.primary) || page.actions[0];
  const queryPrompts =
    page.handle === "faq"
      ? [question, "Where can I find SALT shipping and return information?"]
      : page.handle === "collections"
        ? [question, "How do I narrow from a SALT collection to the right product?"]
        : page.handle === "contact"
          ? [question, "Who should I contact about a SALT order or product question?"]
          : [question, `What is the next step after reading ${lowerTitle}?`];

  return {
    question,
    answer: page.summary,
    usefulFor: `${page.kicker || "SALT"} visitors who need a clear answer before taking the next step.`,
    nextStep: nextAction?.label || "Use the related links on this page.",
    takeaways: page.accent.bullets.slice(0, 3),
    queryPrompts,
  };
}

function ensureAnswerBlock(page: EditorialPageContent): EditorialPageContent {
  return page.answerBlock ? page : { ...page, answerBlock: buildDefaultAnswerBlock(page) };
}

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

type ResourceFaqOptions = {
  categoryTitle?: string;
  summary?: string;
  collectionTitle?: string;
};

function buildResourceFaqs(
  kind: ResourcePageKind,
  title: string,
  options: ResourceFaqOptions = {},
): EditorialFaq[] {
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
        question: "Why does this format make shopping easier?",
        answer:
          "The pages answer the question first, stay narrow, and connect each answer to real product pages and collections people can open next.",
      },
    ];
  }

  if (kind === "category") {
    return [
      {
        question: `What does ${title} cover?`,
        answer: `${options.summary || "This guide turns a broad need into a clearer route."} Use the topic cards to move from the broad category into the question that fits best.`,
      },
      {
        question: `Which collection connects to ${title}?`,
        answer: options.collectionTitle
          ? `This guide connects to the ${options.collectionTitle} collection. Use that route when you are ready to compare the relevant live product listings.`
          : "Use the linked collection route when you are ready to compare the relevant live product listings.",
      },
      {
        question: `What should I open next in ${title}?`,
        answer: "Choose the topic that matches your situation, then review the featured product examples before browsing the full collection.",
      },
    ];
  }

  const scope = options.categoryTitle || "this category";
  return [
    {
      question: `What is ${title} about?`,
      answer: `${options.summary || `This page focuses on ${title.toLowerCase()}.`} Use the topic page as a focused starting point, then follow the collection or product links when you are ready to browse.`,
    },
    {
      question: `Which collection connects to ${title}?`,
      answer: options.collectionTitle
        ? `This topic points to ${options.collectionTitle}. Start there if you want to compare products related to this question.`
        : `Start with ${scope}, then use the featured product links as the practical next step.`,
    },
    {
      question: `What should I check before choosing ${title} in ${scope}?`,
      answer:
        "Match the topic to your own situation, then read the live product details, available options, delivery terms, and return information before ordering.",
    },
  ];
}

function buildResourceActions(kind: ResourcePageKind, collectionRoute: string): EditorialAction[] {
  if (kind === "hub") {
    return [
      { label: "Browse the guides", to: "/pages/resources", primary: true },
      { label: "Shop the catalog", to: "/shop" },
      { label: "Contact us", to: "/pages/contact-us" },
    ];
  }

  const collectionTitle = getCollectionTitleFromRoute(collectionRoute);
  return [
    { label: `Shop ${collectionTitle || "collection"}`, to: collectionRoute, primary: true },
    { label: "Resource Hub", to: "/pages/resources" },
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
    answerBlock: buildResourceAnswerBlock(
      "hub",
      "Resource Hub",
      "Pick the question you're trying to answer, then jump into the guide or topic page that fits it best.",
    ),
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
    cards: [
      ...SITE_RESOURCE_GUIDES.map((guide) => ({
        title: guide.title,
        detail: guide.summary,
        to: buildResourceRoute(guide.handle),
      })),
      {
        title: "Interactive STEM Assembly Activities",
        detail: "Hands-on educational and wooden DIY build ideas for kids and families.",
        to: "/pages/interactive-stem-assembly-activities-for-kids",
      },
      {
        title: "Digital Circus Lunch Box for Kids",
        detail: "A current lunch-box listing framed around school, picnic, camping, and travel use.",
        to: "/pages/digital-circus-lunch-box-for-kids",
      },
      {
        title: "Kitchen & Cookware Buying Guide",
        detail: "A task-first guide to live cookware, food-preparation tools, and practical kitchen helpers.",
        to: "/pages/kitchen-cookware-buying-guide",
      },
      {
        title: "Jeans & Denim Fit Guide",
        detail: "A live-title-led route for comparing straight, high-waisted, loose, flared, and skinny denim signals.",
        to: "/pages/jeans-denim-fit-guide",
      },
      {
        title: "Mobwol 40mm Watch Guide",
        detail: "A live-title-led comparison of the Mobwol-handle quartz listing and current watch alternatives.",
        to: "/pages/mobwol-watch-guide",
      },
      {
        title: "Realme Buds Case Compatibility Guide",
        detail: "Match Realme Buds case variants to the model wording on current live listings.",
        to: "/pages/realme-buds-case-compatibility-guide",
      },
      {
        title: "Earbuds Buying Guide",
        detail: "Separate complete wireless earbuds from cases and replacement tips before choosing.",
        to: "/pages/salt-earbuds-buying-guide",
      },
      {
        title: "Canvas Belt Sizing & Style Guide",
        detail: "Use the live canvas belt lengths and options as a starting point for sizing.",
        to: "/pages/canvas-belt-sizing-style-guide",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The topics behind the hub pages.",
    chips: buildResourceChips("hub", SITE_RESOURCE_GUIDES.map((guide) => guide.title)),
    featuredProductsTitle: "Useful starting products",
    featuredProductsDescription: "A calm cross-category set that represents the hub's most useful routes.",
    featuredProducts: RESOURCE_HUB_HUB_FEATURED_PRODUCTS.map((product) => ({
      handle: product.handle,
    })),
    faqsTitle: "Common questions",
    faqsDescription: "Short answers that help shoppers move from a question to a confident choice.",
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
    answerBlock: buildResourceAnswerBlock("category", guide.title, guide.summary, collectionTitle),
    stats: [
      { label: "Topics", value: String(guide.topics.length) },
      { label: "Collection", value: collectionTitle || "Editorial route" },
      { label: "Intent", value: "Decision support" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Resource Hub", to: "/pages/resources" },
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
    faqs: buildResourceFaqs("category", guide.title, {
      summary: guide.summary,
      collectionTitle,
    }),
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
    answerBlock: buildResourceAnswerBlock("topic", topic.title, topic.summary, collectionTitle),
    stats: [
      { label: "Topic", value: topic.title },
      { label: "Collection", value: collectionTitle || "Editorial route" },
      { label: "Intent", value: "Focused browse" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Resource Hub", to: "/pages/resources" },
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
    faqs: buildResourceFaqs("topic", topic.title, {
      categoryTitle: guide.title,
      summary: topic.summary,
      collectionTitle,
    }),
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
      { label: "Resource Hub", to: "/pages/resources" },
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

function buildInteractiveStemAssemblyPageContent(): EditorialPageContent {
  return {
    handle: "interactive-stem-assembly-activities-for-kids",
    kicker: "Kids activities",
    title: "Interactive STEM Assembly Activities for Kids",
    seoTitle: "Interactive STEM Assembly Activities for Kids | SALT",
    metaDescription:
      "Explore educational assembly toys and science-inspired build activities for kids, with wooden DIY projects and creative play from SALT.",
    summary:
      "Find hands-on build activities that combine curiosity, assembly, and creative play, with live SALT listings grounded in educational and DIY product descriptions.",
    stats: [
      { label: "Format", value: "Hands-on build" },
      { label: "Audience", value: "Kids and families" },
      { label: "Intent", value: "Activity discovery" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Kids Toys & Games", to: "/collections/kids-toys-games" },
      { label: "STEM assembly activities" },
    ],
    accent: {
      label: "Choose by activity",
      title: "Build, explore, and keep the next step clear",
      body:
        "SALT’s live kids listings include educational assembly toys and a wooden DIY carousel described for science-inspired, balancing, and creative assembly play.",
      bullets: ["Educational assembly", "Wooden DIY build", "Creative play"],
    },
    introParagraphs: [
      "Looking for an activity that combines building, curiosity, and creative play? Start with the live listing details, then choose the project whose audience and use context fit the child and the activity setting.",
      "Before ordering, check the selected option and the supplied setup or safety instructions. Keep the activity supervised whenever the product instructions call for it.",
    ],
    cardsTitle: "Featured build activities",
    cardsDescription: "Open the product detail pages to review the current options and supplied listing information.",
    cards: [
      {
        title: "Wooden DIY carousel build",
        detail:
          "A kids educational wooden DIY carousel listing with science-experiment, physics-balancing, and creative-assembly wording.",
        to: "/products/q0kb-kids-educational-wooden-diy-carousel-toy-for-science-experiment-physics-balancing-and-creative-assembly-play-development",
      },
      {
        title: "Educational assembly model",
        detail:
          "A children’s science and educational assembly-toy listing with hand-assembled model and decorative-model wording.",
        to: "/products/childrens-science-and-education-and-educational-assembly-toys-hand-assembled-models-decorative-models-childrens-diy-gifts",
      },
    ],
    stepsTitle: "Before choosing a project",
    stepsDescription: "Use the live product details as the source of truth for the activity.",
    steps: [
      {
        step: "01",
        title: "Match the activity",
        detail: "Choose a listing whose described audience and use context fit the child and the setting.",
      },
      {
        step: "02",
        title: "Review the option",
        detail: "Check the selected option, product details, and supplied setup information before ordering.",
      },
      {
        step: "03",
        title: "Set up thoughtfully",
        detail: "Follow the supplied instructions and supervise the activity whenever those instructions call for it.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Interactive STEM assemblies", "Educational assembly toys", "Wooden DIY activities", "Creative build play"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current product listings.",
    faqs: [
      {
        question: "What does STEM assembly mean on this page?",
        answer:
          "Here it describes build-and-explore products whose live listings use science, educational, balancing, or creative assembly language.",
      },
      {
        question: "Which products are featured?",
        answer:
          "The page currently highlights a wooden DIY carousel listing and a children’s educational assembly-model listing. Open each product page to review its current details.",
      },
      {
        question: "How should I choose an activity?",
        answer:
          "Start with the listing’s described audience and use context, then check the selected option and supplied setup or safety information before ordering.",
      },
    ],
    featuredProductsTitle: "Shop the live product details",
    featuredProductsDescription: "These product links keep the guide connected to the current SALT catalog.",
    featuredProducts: [
      {
        handle:
          "q0kb-kids-educational-wooden-diy-carousel-toy-for-science-experiment-physics-balancing-and-creative-assembly-play-development",
        collectionLabel: "Kids Toys & Games",
      },
      {
        handle:
          "childrens-science-and-education-and-educational-assembly-toys-hand-assembled-models-decorative-models-childrens-diy-gifts",
        collectionLabel: "Kids Toys & Games",
      },
    ],
    actions: [
      { label: "Browse Kids Toys & Games", to: "/collections/kids-toys-games", primary: true },
      {
        label: "Open Resource Hub",
        to: "/pages/resources",
      },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildDigitalCircusLunchBoxPageContent(): EditorialPageContent {
  return {
    handle: "digital-circus-lunch-box-for-kids",
    kicker: "Lunch box finds",
    title: "Digital Circus Lunch Box for Kids",
    seoTitle: "Amazing Digital Circus Lunch Box for Kids | SALT",
    metaDescription:
      "Explore SALT's Amazing Digital Circus lunch box listing for school, picnic, camping, and travel use. Review current options and product details before ordering.",
    summary:
      "Explore a current SALT lunch box listing for kids, with product details framed around school, picnic, camping, and travel use.",
    stats: [
      { label: "Format", value: "Lunch box" },
      { label: "Audience", value: "Kids, boys & girls" },
      { label: "Intent", value: "School-day discovery" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Lunch Boxes", to: "/collections/lunch-boxes" },
      { label: "Digital Circus lunch box" },
    ],
    accent: {
      label: "Start with the listing",
      title: "Make lunch-box discovery simpler",
      body:
        "The current SALT listing uses the product title and supplied details to describe a lunch box for kids, boys, and girls, with school, picnic, camping, travel, and kitchen context.",
      bullets: ["School use", "Picnic and travel", "Kids-focused listing"],
    },
    introParagraphs: [
      "If you are comparing lunch containers for a child, this guide points to one current SALT listing whose title and supplied details mention kids, boys, girls, school, picnic, camping, and travel.",
      "Use the product page as the source of truth. Review the selected option, current price, availability, and supplied care or handling information before ordering; the listing does not establish extra features beyond its current details.",
    ],
    cardsTitle: "What to review",
    cardsDescription: "Keep the shopping decision connected to the live listing and collection.",
    cards: [
      {
        title: "Current product listing",
        detail: "Open the live product page to review options, price, availability, and supplied details.",
        to: "/products/the-amazing-digital-circus-lunch-box-for-kids-school-cute-food-storage-containers-boys-girls-picnic-bento-children-birthday-gift",
      },
      {
        title: "Lunch Boxes collection",
        detail: "Browse the live lunch-box collection when you want to compare nearby options.",
        to: "/collections/lunch-boxes",
      },
      {
        title: "Back to School",
        detail: "Use the school-season collection as another route into relevant current listings.",
        to: "/collections/back-to-school",
      },
    ],
    stepsTitle: "Before choosing a lunch box",
    stepsDescription: "Use current listing information to keep the choice specific and grounded.",
    steps: [
      {
        step: "01",
        title: "Match the use",
        detail: "Choose a listing whose described audience and use context fit the child, school day, picnic, or trip.",
      },
      {
        step: "02",
        title: "Check the option",
        detail: "Review the selected variant, current price, availability, and product details before adding it to the cart.",
      },
      {
        step: "03",
        title: "Follow the details",
        detail: "Use the supplied care, handling, storage, and safety information for the selected product.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Lunch box for kids", "School lunch container", "Picnic lunch box", "Travel food storage"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current product listing.",
    faqs: [
      {
        question: "What use cases appear in the listing?",
        answer:
          "The current product details mention school, picnic, camping, travel, and kitchen context, alongside kids, boys, girls, and children as the audience.",
      },
      {
        question: "Is the product officially licensed?",
        answer:
          "The current product title uses The Amazing Digital Circus wording, but the live listing does not independently verify licensing or affiliation. Review the product page and seller details before ordering.",
      },
      {
        question: "What should I check before ordering?",
        answer:
          "Check the selected option, current price, availability, product description, and supplied care or handling information on the live product page.",
      },
    ],
    featuredProductsTitle: "Shop the live product details",
    featuredProductsDescription: "This product link keeps the guide tied to the current SALT catalog record.",
    featuredProducts: [
      {
        handle:
          "the-amazing-digital-circus-lunch-box-for-kids-school-cute-food-storage-containers-boys-girls-picnic-bento-children-birthday-gift",
        reason: "The live title and description mention a lunch box for kids with school, picnic, camping, and travel context.",
        collectionLabel: "Lunch Boxes",
      },
    ],
    actions: [
      { label: "Browse Lunch Boxes", to: "/collections/lunch-boxes", primary: true },
      { label: "Browse Back to School", to: "/collections/back-to-school" },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildKitchenCookwareBuyingGuidePageContent(): EditorialPageContent {
  return {
    handle: "kitchen-cookware-buying-guide",
    kicker: "Kitchen & cookware",
    title: "Kitchen & Cookware Buying Guide",
    seoTitle: "Kitchen & Cookware Buying Guide | SALT",
    metaDescription:
      "Use SALT's Kitchen & Cookware collection to compare cookware, food-preparation tools, dining essentials, and practical kitchen helpers by task.",
    summary:
      "A task-first route into SALT's Kitchen & Cookware collection, with live product details for food preparation and everyday kitchen use.",
    stats: [
      { label: "Collection", value: "Kitchen & Cookware" },
      { label: "Format", value: "Guided browse" },
      { label: "Intent", value: "Small-kitchen planning" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Kitchen & Cookware", to: "/collections/cookware" },
      { label: "Buying guide" },
    ],
    accent: {
      label: "Choose by task",
      title: "Start with the kitchen job, then compare the tool",
      body:
        "The live SALT collection description covers cookware, kitchen tools, dining essentials, and food-preparation accessories. Use the individual product details to narrow the choice to the job you actually need to do.",
      bullets: ["Food preparation", "Dining and serving", "Everyday kitchen helpers"],
    },
    introParagraphs: [
      "A useful kitchen setup starts with the task: opening, chopping, pressing, or preparing ingredients. This guide keeps the browse focused on live SALT listings whose titles and supplied details clearly describe those jobs.",
      "Open the collection for the wider catalog, then review the selected product's current option, price, availability, material or capacity wording, and supplied care information before ordering.",
    ],
    cardsTitle: "Live kitchen-tool starting points",
    cardsDescription: "These links are tied to current product titles and supplied listing details.",
    cards: [
      {
        title: "Chestnut opener",
        detail: "A stainless-steel chestnut opener listing described for peeling and shelling at home.",
        to: "/products/chestnut-opener-stainless-steel-chestnut-peeler-cross-knife-for-peeling-and-shelling-for-home-use",
      },
      {
        title: "Garlic and onion cutter",
        detail: "A manual kitchen-tool listing with 900ml wording for garlic, onion, and salad preparation.",
        to: "/products/500-900ml-hand-chopper-manual-rope-food-processor-silcer-shredder-salad-maker-garlic-onion-cutter-kitchen-tool-accessories",
      },
      {
        title: "Potato masher and press",
        detail: "A stainless-steel masher and press listing for mashed-potato and fruit or vegetable preparation.",
        to: "/products/masher-ricerpress-mashed-potatoes-stainless-steel-crushing-puree-fruit-vegetable-squeezerjuicer-press-maker-kitchen-tools-1",
      },
      {
        title: "Portable garlic crusher",
        detail: "A manual portable garlic-crusher listing with kitchen-use wording.",
        to: "/products/1-2pcs-manual-portable-garlic-crusher-twist-kitchen-gadget-for-crushing-garlic-and-ginger-easy-to-use-and-clean",
      },
    ],
    stepsTitle: "Before choosing a kitchen helper",
    stepsDescription: "Use the live listing as the decision source.",
    steps: [
      {
        step: "01",
        title: "Name the task",
        detail: "Decide whether you need an opener, chopper, masher, crusher, or another specific kitchen function.",
      },
      {
        step: "02",
        title: "Check the detail",
        detail: "Review the product title, supplied material or capacity wording, selected option, current price, and availability.",
      },
      {
        step: "03",
        title: "Follow the care notes",
        detail: "Use the supplied setup, handling, cleaning, storage, and safety information for the selected product.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Kitchen and cookware", "Food preparation tools", "Small kitchen essentials", "Manual kitchen gadgets"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current collection and product listings.",
    faqs: [
      {
        question: "What does the Kitchen & Cookware collection cover?",
        answer:
          "Its current collection description mentions cookware, kitchen tools, dining essentials, and food-preparation accessories.",
      },
      {
        question: "How should I choose between the featured tools?",
        answer:
          "Start with the task named in the live product title, then check the supplied material or capacity wording, selected option, current price, and availability.",
      },
      {
        question: "Where can I compare more products?",
        answer:
          "Open the live Kitchen & Cookware collection to browse beyond the four task-specific starting points on this guide.",
      },
    ],
    featuredProductsTitle: "Shop the live product details",
    featuredProductsDescription: "These product links keep the guide connected to current SALT catalog records.",
    featuredProducts: [
      {
        handle:
          "chestnut-opener-stainless-steel-chestnut-peeler-cross-knife-for-peeling-and-shelling-for-home-use",
        reason: "The live title and details identify a stainless-steel chestnut opener for peeling and shelling.",
        collectionLabel: "Kitchen & Cookware",
      },
      {
        handle:
          "500-900ml-hand-chopper-manual-rope-food-processor-silcer-shredder-salad-maker-garlic-onion-cutter-kitchen-tool-accessories",
        reason: "The live title and details identify a manual garlic and onion cutter with 900ml wording.",
        collectionLabel: "Kitchen & Cookware",
      },
      {
        handle:
          "masher-ricerpress-mashed-potatoes-stainless-steel-crushing-puree-fruit-vegetable-squeezerjuicer-press-maker-kitchen-tools-1",
        reason: "The live title and details identify a stainless-steel masher and press for food preparation.",
        collectionLabel: "Kitchen & Cookware",
      },
      {
        handle:
          "1-2pcs-manual-portable-garlic-crusher-twist-kitchen-gadget-for-crushing-garlic-and-ginger-easy-to-use-and-clean",
        reason: "The live title and details identify a manual portable garlic crusher for kitchen use.",
        collectionLabel: "Kitchen & Cookware",
      },
    ],
    actions: [
      { label: "Browse Kitchen & Cookware", to: "/collections/cookware", primary: true },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildJeansDenimFitGuidePageContent(): EditorialPageContent {
  return {
    handle: "jeans-denim-fit-guide",
    kicker: "Jeans & denim",
    title: "Jeans & Denim Fit Guide",
    seoTitle: "Jeans & Denim Fit Guide | SALT",
    metaDescription:
      "Compare the live SALT Jeans collection by the fit and style wording in current product titles, then check size details before ordering.",
    summary:
      "A practical route into SALT's Jeans collection, using current product-title signals to compare denim styles without promising a fit the listing does not verify.",
    stats: [
      { label: "Collection", value: "Jeans" },
      { label: "Audience", value: "Men and women" },
      { label: "Intent", value: "Fit and style discovery" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Jeans", to: "/collections/jeans" },
      { label: "Denim fit guide" },
    ],
    accent: {
      label: "Compare the silhouette",
      title: "Use the live title as your first filter",
      body:
        "The current SALT Jeans collection is described as denim-led apparel for casual and everyday styling. Its live product titles provide useful starting signals such as straight leg, high waisted, loose, flared, boot cut, and skinny.",
      bullets: ["Straight-leg signals", "High-waisted and skinny signals", "Loose, flared, and boot-cut signals"],
    },
    introParagraphs: [
      "If you are shopping for jeans, start with the silhouette you want, then open the live product page to check the available options and size information. This guide uses the wording currently visible in SALT product titles rather than treating a style label as a guaranteed fit.",
      "The current live descriptions identify both men's and women's audience wording. Review the selected option, measurements or size guidance, current price, availability, and supplied care information before ordering.",
    ],
    cardsTitle: "Live style starting points",
    cardsDescription: "These links are tied to current product titles and supplied listing details.",
    cards: [
      {
        title: "Straight-leg denim",
        detail: "A men's listing whose current title uses straight-leg, comfort, and mid-waist wording.",
        to: "/products/mens-jeans-black-denim-pants-straight-leg-comfort-mid-waist-white-embroidery-casual-streetwear-spring-slim-fit-trousers",
      },
      {
        title: "High-waisted jegging",
        detail: "A women's listing whose current title uses high-waisted, stretchy, and jegging wording.",
        to: "/products/women-jegging-jeans-high-waisted-fashion-denim-pants-good-stretchy-streetwear-running-sports-casual-body-shaping-pants-legging",
      },
      {
        title: "Loose and worn denim",
        detail: "A men's listing whose current title uses loose, worn, and patch-detail wording.",
        to: "/products/mens-jeans-patch-lightning-jeans-mens-loose-jeans-worn-out-jeans",
      },
      {
        title: "Flared and boot-cut denim",
        detail: "A men's listing whose current title uses flared and boot-cut wording.",
        to: "/products/jeans-men-mens-flared-jeans-boot-cut-leg-flared-male-designer-classic-denim-jeans-high-waist-stretch-loose-flared-blue-jeans",
      },
    ],
    stepsTitle: "Before choosing a pair",
    stepsDescription: "Keep style discovery separate from fit confirmation.",
    steps: [
      {
        step: "01",
        title: "Choose the style cue",
        detail: "Use the live title's straight, skinny, loose, high-waisted, flared, or boot-cut wording as the first filter.",
      },
      {
        step: "02",
        title: "Check the size detail",
        detail: "Review the product page's available options, measurements or size guidance, and audience wording before ordering.",
      },
      {
        step: "03",
        title: "Review the live listing",
        detail: "Confirm the selected option, current price, availability, product details, and supplied care information.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Jeans fit guide", "Straight-leg denim", "High-waisted jeans", "Loose and flared jeans"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current collection and product titles.",
    faqs: [
      {
        question: "What does the Jeans collection cover?",
        answer: "Its current collection description says it is denim-led apparel for casual and everyday styling.",
      },
      {
        question: "Can a title guarantee the fit?",
        answer:
          "No. The style words on this guide come from current product titles. Use them as a starting filter, then check the live product's size details and selected option.",
      },
      {
        question: "Are both men's and women's listings represented?",
        answer:
          "Yes. The current live product descriptions used here identify men's or women's audience wording. Review each product page for its exact audience and options.",
      },
    ],
    featuredProductsTitle: "Shop the live product details",
    featuredProductsDescription: "These product links keep the guide connected to current SALT denim records.",
    featuredProducts: [
      {
        handle:
          "mens-jeans-black-denim-pants-straight-leg-comfort-mid-waist-white-embroidery-casual-streetwear-spring-slim-fit-trousers",
        reason: "The live title uses straight-leg, comfort, and mid-waist wording for a men's jeans listing.",
        collectionLabel: "Jeans",
      },
      {
        handle:
          "women-jegging-jeans-high-waisted-fashion-denim-pants-good-stretchy-streetwear-running-sports-casual-body-shaping-pants-legging",
        reason: "The live title uses high-waisted, stretchy, and jegging wording for a women's jeans listing.",
        collectionLabel: "Jeans",
      },
      {
        handle: "mens-jeans-patch-lightning-jeans-mens-loose-jeans-worn-out-jeans",
        reason: "The live title uses loose and worn wording for a men's jeans listing.",
        collectionLabel: "Jeans",
      },
      {
        handle:
          "jeans-men-mens-flared-jeans-boot-cut-leg-flared-male-designer-classic-denim-jeans-high-waist-stretch-loose-flared-blue-jeans",
        reason: "The live title uses flared and boot-cut wording for a men's jeans listing.",
        collectionLabel: "Jeans",
      },
    ],
    actions: [
      { label: "Browse Jeans", to: "/collections/jeans", primary: true },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildMobwolWatchGuidePageContent(): EditorialPageContent {
  return {
    handle: "mobwol-watch-guide",
    kicker: "Watch discovery",
    title: "Mobwol 40mm Watch Guide",
    seoTitle: "Mobwol 40mm Quartz Watch Guide | SALT",
    metaDescription:
      "Compare the SALT Mobwol-handle 40mm quartz watch with current mechanical, smart, and women's watch listings, then review options before ordering.",
    summary:
      "A product-led watch comparison built from current SALT titles and supplied listing details. The live URL uses a Mobwol handle, while the customer-facing title currently identifies a 40mm quartz watch.",
    stats: [
      { label: "Collection", value: "Watches" },
      { label: "Focus", value: "40mm quartz" },
      { label: "Intent", value: "Watch comparison" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Watches", to: "/collections/watches" },
      { label: "Mobwol watch guide" },
    ],
    accent: {
      label: "Start with the listing",
      title: "Compare movement, materials, and options",
      body:
        "The current Mobwol-handle listing is titled 40mm Quartz Watch Sport Wear Quartz Watch. Its supplied details mention a 40mm size, glass and stainless-steel material wording, waterproof wording, a men's audience, and Black or White color options.",
      bullets: ["40mm quartz listing", "Glass and stainless-steel wording", "Black or White options"],
    },
    introParagraphs: [
      "If you searched for a Mobwol watch, use the matching live product page as the source of truth. The handle contains Mobwol, but the current customer-facing title and supplied details are the safer basis for comparing the listing.",
      "Use the comparison cards to choose a starting point, then review the selected option, current price, availability, product details, and supplied care information before ordering. This page does not infer a brand relationship or features that the live records do not state.",
    ],
    cardsTitle: "Live watch starting points",
    cardsDescription: "Each link is tied to a current active watch listing and its visible title signals.",
    cards: [
      {
        title: "Mobwol-handle 40mm quartz watch",
        detail: "The live title and details mention 40mm, quartz, glass, stainless steel, waterproof wording, and Black or White options.",
        to: "/products/mobwol-2026-new-mens-watches-40mm-luxury-quartz-watch-men-sport-wear-resistant-glass-3bar-waterproof-stainless-steel",
      },
      {
        title: "Automatic mechanical watch",
        detail: "The live title uses automatic, mechanical, waterproof, and genuine-leather wording, with a stainless-steel material signal.",
        to: "/products/high-end-waterproof-automatic-mechanical-watch-with-genuine-leather-strap-and-stainless-steel-transparent-back-cover",
      },
      {
        title: "Sports smart watch",
        detail: "The live title uses sports smart watch, HD screen, Bluetooth, and waterproof wording. Check device compatibility on the listing.",
        to: "/products/2026-new-sports-smart-watch-1-39-hd-screen-with-bluetooth-call-ip68-waterproof-health-monitoring-smartwatch-for-android-and-ios",
      },
      {
        title: "Women's casual wristwatch",
        detail: "The live title uses numerals, thin bracelet, casual wristwatch, and women's audience wording with multiple color options.",
        to: "/products/women-quartz-watches-for-women-fashion-ladies-watches-with-simple-dial-easy-read-numerals-thin-bracelet-casual-wristwatch-gift",
      },
    ],
    stepsTitle: "Before choosing a watch",
    stepsDescription: "Keep the comparison grounded in the live listing.",
    steps: [
      {
        step: "01",
        title: "Choose the watch type",
        detail: "Start with quartz, mechanical, smart, or casual wristwatch wording in the current product title.",
      },
      {
        step: "02",
        title: "Check the options",
        detail: "Review the available color or other options, selected variant, current price, and availability.",
      },
      {
        step: "03",
        title: "Confirm the details",
        detail: "Read the supplied materials, feature wording, compatibility notes, and care information before ordering.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Mobwol watch", "40mm quartz watch", "Automatic mechanical watch", "Sports smart watch"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in current live watch records.",
    faqs: [
      {
        question: "Does the live title confirm the Mobwol brand?",
        answer:
          "The product URL uses a Mobwol handle, but the current customer-facing title says 40mm Quartz Watch Sport Wear Quartz Watch. Review the live listing and seller details before treating the handle as a brand claim.",
      },
      {
        question: "What details are listed for the 40mm watch?",
        answer:
          "The supplied listing details mention a 40mm size, quartz wording, glass and stainless-steel material wording, waterproof wording, a men's audience, and Black or White options.",
      },
      {
        question: "Where can I compare more watch types?",
        answer:
          "Open the live Watches collection to compare additional active listings, then check each product page for its exact options and supplied details.",
      },
    ],
    featuredProductsTitle: "Shop the live product details",
    featuredProductsDescription: "These links keep the guide connected to current SALT watch records.",
    featuredProducts: [
      {
        handle:
          "mobwol-2026-new-mens-watches-40mm-luxury-quartz-watch-men-sport-wear-resistant-glass-3bar-waterproof-stainless-steel",
        reason: "The live handle contains Mobwol and the current title uses 40mm and quartz watch wording.",
        collectionLabel: "Watches",
      },
      {
        handle: "high-end-waterproof-automatic-mechanical-watch-with-genuine-leather-strap-and-stainless-steel-transparent-back-cover",
        reason: "The live title uses automatic mechanical, waterproof, leather, and stainless-steel wording.",
        collectionLabel: "Watches",
      },
      {
        handle:
          "2026-new-sports-smart-watch-1-39-hd-screen-with-bluetooth-call-ip68-waterproof-health-monitoring-smartwatch-for-android-and-ios",
        reason: "The live title uses sports smart watch, HD screen, Bluetooth, and waterproof wording.",
        collectionLabel: "Watches",
      },
      {
        handle:
          "women-quartz-watches-for-women-fashion-ladies-watches-with-simple-dial-easy-read-numerals-thin-bracelet-casual-wristwatch-gift",
        reason: "The live title uses numerals, thin bracelet, casual wristwatch, and women's audience wording.",
        collectionLabel: "Watches",
      },
    ],
    actions: [
      { label: "Browse Watches", to: "/collections/watches", primary: true },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildRealmeBudsCaseCompatibilityGuidePageContent(): EditorialPageContent {
  return {
    handle: "realme-buds-case-compatibility-guide",
    kicker: "Audio accessories",
    title: "Realme Buds Case Compatibility Guide",
    seoTitle: "Realme Buds Case Compatibility Guide | SALT",
    metaDescription:
      "Compare live SALT Realme Buds cases by supported model wording, silicone material, and current options before ordering.",
    summary:
      "A model-first route for shoppers comparing Realme Buds protective cases, using the model wording and options visible in current SALT listings.",
    stats: [
      { label: "Category", value: "Earbuds cases" },
      { label: "Focus", value: "Model matching" },
      { label: "Intent", value: "Compatibility discovery" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Audio", to: "/collections/audio" },
      { label: "Realme Buds case guide" },
    ],
    accent: {
      label: "Match the model first",
      title: "Choose the case by the exact variant wording",
      body:
        "The live SALT case listings use different model signals: one listing is specifically tied to Realme Buds Air8, while another lists Air5, Air5 Pro, Air6, Air6 Pro, T01, T100, T110, T300, and T310 in its variant titles.",
      bullets: ["Air8 case listing", "Air5 and Air6 variants", "Silicone case material"],
    },
    introParagraphs: [
      "Searching for a Realme Buds Air 5 cover? Start by matching the model printed on the earbuds or charging case to the exact option shown on the live product page.",
      "The current Air8 case is a separate listing from the multi-model case. Select the matching option, then review the current price, availability, material wording, and product details before ordering. A case title or variant label is not a substitute for checking the fit yourself.",
    ],
    cardsTitle: "Live case starting points",
    cardsDescription: "Use the model wording as the first filter, then open the listing for the selected option.",
    cards: [
      {
        title: "Realme Buds Air8 case",
        detail: "The live listing handle and SEO details identify compatibility with Realme Buds Air8; its supplied details mention silicone and portable use.",
        to: "/products/silicone-protective-case-for-realme-buds-air8-liquid-silicone-cover-slim-lightweight-headphones-protective-case-1pcs",
      },
      {
        title: "Multi-model Realme Buds case",
        detail: "The live variant titles include Realme Buds Air5, Air5 Pro, Air6, Air6 Pro, T01, T100, T110, T300, and T310 options.",
        to: "/products/case-for-realme-buds-t01-t310-t300-t100-t110-air5-air6-pro-silicone-cover-black-flower-earbuds-soft-protective-headset-skin",
      },
      {
        title: "Audio and cases collection",
        detail: "Browse related earbuds, cases, and audio listings after identifying the model you need.",
        to: "/collections/audio",
      },
    ],
    stepsTitle: "Before choosing a case",
    stepsDescription: "Keep compatibility decisions tied to the selected live variant.",
    steps: [
      {
        step: "01",
        title: "Read the model",
        detail: "Confirm the exact Realme Buds model from the device or charging-case information.",
      },
      {
        step: "02",
        title: "Open the matching listing",
        detail: "Use the handle and variant wording to find the case that names your model.",
      },
      {
        step: "03",
        title: "Verify the option",
        detail: "Check the selected variant, current price, availability, material wording, and product details before ordering.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Realme Buds Air 5 cover", "Realme Buds Air8 case", "Earbuds protective case", "Silicone earbuds cover"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current case listings.",
    faqs: [
      {
        question: "Does the Air8 case also confirm Air5 compatibility?",
        answer:
          "No. The Air8 case is a separate listing. Use the multi-model case listing when its variant titles name Air5 or another supported model, then confirm the selected option before ordering.",
      },
      {
        question: "Which models appear in the multi-model case options?",
        answer:
          "The current variant titles include Realme Buds Air5, Air5 Pro, Air6, Air6 Pro, T01, T100, T110, T300, and T310.",
      },
      {
        question: "What material is stated in the listings?",
        answer:
          "The supplied listing details use silicone material wording. Review the live product page for the selected option and current care information.",
      },
    ],
    featuredProductsTitle: "Shop the live case details",
    featuredProductsDescription: "These links keep the guide connected to current SALT case records.",
    featuredProducts: [
      {
        handle:
          "silicone-protective-case-for-realme-buds-air8-liquid-silicone-cover-slim-lightweight-headphones-protective-case-1pcs",
        reason: "The live handle and SEO details identify Realme Buds Air8 compatibility.",
        collectionLabel: "Audio",
      },
      {
        handle:
          "case-for-realme-buds-t01-t310-t300-t100-t110-air5-air6-pro-silicone-cover-black-flower-earbuds-soft-protective-headset-skin",
        reason: "The live variant titles name Air5, Air6, and Realme Buds T-series options.",
        collectionLabel: "Audio",
      },
    ],
    actions: [
      { label: "Browse Audio", to: "/collections/audio", primary: true },
      { label: "Browse Earbuds & Cases", to: "/collections/earbuds-and-cases" },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildSaltEarbudsBuyingGuidePageContent(): EditorialPageContent {
  return {
    handle: "salt-earbuds-buying-guide",
    kicker: "Earbuds and audio",
    title: "Earbuds Buying Guide: Cases, Tips & Wireless Earbuds",
    seoTitle: "Earbuds Buying Guide: Cases, Tips & Wireless Earbuds | SALT",
    metaDescription:
      "Compare SALT wireless earbuds, protective cases, and replacement tips by product type, compatibility wording, and listed features.",
    summary:
      "A clear starting point for comparing complete wireless earbuds with the cases and replacement tips that support them.",
    stats: [
      { label: "Formats", value: "3" },
      { label: "Focus", value: "Audio choices" },
      { label: "Intent", value: "Product discovery" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Audio", to: "/collections/audio" },
      { label: "Earbuds buying guide" },
    ],
    accent: {
      label: "Start with the product type",
      title: "Separate earbuds from cases and tips",
      body:
        "The current SALT audio listings include complete wireless earbuds, protective cases, and replacement ear tips. Product type and compatibility wording should be checked before comparing features or adding an item to the cart.",
      bullets: ["Complete earbuds", "Protective cases", "Replacement ear tips"],
    },
    introParagraphs: [
      "If you searched for earbuds, first decide whether you need a complete listening product, a protective case, or replacement ear tips. The live product titles and supplied details use different model and product-type signals.",
      "Compare only the features stated on the selected listing. Check the model, selected option, current price, availability, compatibility wording, and supplied care information before ordering.",
    ],
    cardsTitle: "Live audio starting points",
    cardsDescription: "Open each listing to review the current product type and model-specific options.",
    cards: [
      {
        title: "Realme Buds Air 8 wireless earbuds",
        detail: "A complete earbuds listing whose title and supplied details use wireless, Bluetooth, and portable wording.",
        to: "/products/realme-buds-air-8-wireless-earphone-bluetooth-5-4-active-noise-cancelling-true-hours-battery-tws-earbuds-global-version",
      },
      {
        title: "Xiaomi Buds 6 wireless earbuds",
        detail: "A complete wireless earbuds listing whose title and supplied details use Bluetooth and portable wording.",
        to: "/products/new-xiaomi-buds-6-bluetooth-earphone-real-time-translation-headphones-professional-tuning-earbuds-super-light-earphone-headset",
      },
      {
        title: "Protective case",
        detail: "A separate Realme Buds Air8 case listing with silicone and portable-use wording.",
        to: "/products/silicone-protective-case-for-realme-buds-air8-liquid-silicone-cover-slim-lightweight-headphones-protective-case-1pcs",
      },
      {
        title: "Replacement ear tips",
        detail: "A separate ear-tips listing whose title references Realme Buds Air 5 Pro and whose supplied details mention silicone.",
        to: "/products/tips-for-realme-buds-air-5-pro-earbuds-eartips-moondrop-golden-ages-tws-silicone-ear-tips-headphones-earplugs",
      },
    ],
    stepsTitle: "Before choosing an audio product",
    stepsDescription: "Use the live listing to keep the comparison precise.",
    steps: [
      {
        step: "01",
        title: "Name the need",
        detail: "Choose complete earbuds, a protective case, or replacement tips before comparing listings.",
      },
      {
        step: "02",
        title: "Match the model",
        detail: "Check the model wording in the title, variant options, and compatibility details.",
      },
      {
        step: "03",
        title: "Review the listing",
        detail: "Confirm the selected option, current price, availability, listed features, and supplied care information.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["SALT earbuds", "Wireless Bluetooth earbuds", "Earbuds cases", "Replacement ear tips"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current SALT audio listings.",
    faqs: [
      {
        question: "How are earbuds different from a case or ear tips?",
        answer:
          "The complete-earbuds listings describe listening products, while the separate case and ear-tips listings are accessories. Check the product title and type before ordering.",
      },
      {
        question: "What features are visible in the complete-earbuds listings?",
        answer:
          "The current Realme and Xiaomi listings use wireless, Bluetooth, and portable wording in their supplied details. Review each live page for the exact model and current options.",
      },
      {
        question: "Can I assume an accessory fits every earbud?",
        answer:
          "No. Match the accessory to the exact model wording and selected option on the live listing. Do not rely on a general earbuds label alone.",
      },
    ],
    featuredProductsTitle: "Shop the live audio details",
    featuredProductsDescription: "These links keep the guide connected to current SALT earbuds and accessory records.",
    featuredProducts: [
      {
        handle:
          "realme-buds-air-8-wireless-earphone-bluetooth-5-4-active-noise-cancelling-true-hours-battery-tws-earbuds-global-version",
        reason: "The live title and supplied details identify a complete Realme Buds Air 8 wireless Bluetooth earbuds listing.",
        collectionLabel: "Audio",
      },
      {
        handle:
          "new-xiaomi-buds-6-bluetooth-earphone-real-time-translation-headphones-professional-tuning-earbuds-super-light-earphone-headset",
        reason: "The live title and supplied details identify a complete Xiaomi Buds 6 wireless Bluetooth earbuds listing.",
        collectionLabel: "Audio",
      },
      {
        handle:
          "silicone-protective-case-for-realme-buds-air8-liquid-silicone-cover-slim-lightweight-headphones-protective-case-1pcs",
        reason: "The live listing is a separate Realme Buds Air8 protective case.",
        collectionLabel: "Audio",
      },
      {
        handle:
          "tips-for-realme-buds-air-5-pro-earbuds-eartips-moondrop-golden-ages-tws-silicone-ear-tips-headphones-earplugs",
        reason: "The live title references Realme Buds Air 5 Pro replacement ear tips.",
        collectionLabel: "Audio",
      },
    ],
    actions: [
      { label: "Browse Audio", to: "/collections/audio", primary: true },
      { label: "Browse Earbuds & Cases", to: "/collections/earbuds-and-cases" },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
    ],
  };
}

function buildCanvasBeltSizingStyleGuidePageContent(): EditorialPageContent {
  return {
    handle: "canvas-belt-sizing-style-guide",
    kicker: "Men's accessories",
    title: "Canvas Belt Sizing & Style Guide",
    seoTitle: "Canvas Belt Sizing & Style Guide | SALT",
    metaDescription:
      "Compare SALT men's canvas belts by listed length, color option, buckle style, and fit before ordering.",
    summary:
      "A practical guide to the current SALT canvas belt listing, with length and option cues taken directly from its live variants.",
    stats: [
      { label: "Material", value: "Canvas" },
      { label: "Lengths", value: "105–130 cm" },
      { label: "Audience", value: "Men" },
    ],
    breadcrumbs: [
      { label: "Home", to: "/" },
      { label: "Men's Accessories", to: "/collections/mens-accessories" },
      { label: "Canvas belt guide" },
    ],
    accent: {
      label: "Measure before ordering",
      title: "Choose the listed length and option together",
      body:
        "The current listing title uses porous, pin-buckle, canvas, and men's wording. Its live variants include 105 cm, 110 cm, 120 cm, and 130 cm length signals alongside five numbered color options.",
      bullets: ["Canvas material", "Pin-buckle title signal", "105–130 cm variants"],
    },
    introParagraphs: [
      "The easiest way to choose a canvas belt is to start with a measurement you already trust, then match that measurement to the exact length option on the live listing.",
      "The current product record identifies canvas material and a men's audience. Review the selected color and length, current price, availability, product details, and supplied care information before ordering; the title alone does not guarantee fit.",
    ],
    cardsTitle: "Live belt starting point",
    cardsDescription: "The current product has multiple length and numbered color options.",
    cards: [
      {
        title: "Porous pin-buckle canvas belt",
        detail: "The live title uses men's canvas-belt and pin-buckle wording, with 105 cm, 110 cm, 120 cm, and 130 cm option signals.",
        to: "/products/new-porous-pin-buckle-canvas-belts-mens-fashion-versatile-belt-student-youth-military-training-extended-denim-designer-belt",
      },
      {
        title: "Men's accessories",
        detail: "Browse the related live collection for current belts and nearby accessory listings.",
        to: "/collections/mens-accessories",
      },
      {
        title: "Men's collection",
        detail: "Use the broader men's route when you want to compare accessories with other current listings.",
        to: "/collections/men-collection",
      },
    ],
    stepsTitle: "Before choosing a belt",
    stepsDescription: "Use your measurement and the selected live option together.",
    steps: [
      {
        step: "01",
        title: "Measure a reference",
        detail: "Use a belt that fits or follow the measurement method supplied on the product page.",
      },
      {
        step: "02",
        title: "Match the length",
        detail: "Compare your reference measurement with the available 105 cm, 110 cm, 120 cm, or 130 cm option.",
      },
      {
        step: "03",
        title: "Confirm the option",
        detail: "Check the selected numbered color, current price, availability, material wording, and product details.",
      },
    ],
    chipsTitle: "Search cues",
    chipsDescription: "The phrases this guide is designed to answer.",
    chips: ["Canvas belt", "Porous belt", "Pin-buckle belt", "Men's belt sizing"],
    faqsTitle: "Common questions",
    faqsDescription: "Short answers grounded in the current belt listing.",
    faqs: [
      {
        question: "What material is stated for the belt?",
        answer: "The current product details use canvas material wording and identify a men's audience.",
      },
      {
        question: "Which length options are visible?",
        answer: "The live variant titles include 105 cm, 110 cm, 120 cm, and 130 cm length signals.",
      },
      {
        question: "Are the numbered options guaranteed to fit a specific waist?",
        answer:
          "No. Use the live product measurement information and compare it with a belt or measurement that already fits you before choosing an option.",
      },
    ],
    featuredProductsTitle: "Shop the live belt details",
    featuredProductsDescription: "This link keeps the guide connected to the current SALT belt record.",
    featuredProducts: [
      {
        handle:
          "new-porous-pin-buckle-canvas-belts-mens-fashion-versatile-belt-student-youth-military-training-extended-denim-designer-belt",
        reason: "The live title and details identify a men's canvas belt with porous and pin-buckle wording.",
        collectionLabel: "Men's Accessories",
      },
    ],
    actions: [
      { label: "Browse Men's Accessories", to: "/collections/mens-accessories", primary: true },
      { label: "Browse Men's Collection", to: "/collections/men-collection" },
      { label: "Open Resource Hub", to: "/pages/resources" },
      { label: "Contact SALT", to: "/pages/contact-us" },
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
  "interactive-stem-assembly-activities-for-kids": buildInteractiveStemAssemblyPageContent(),
  "digital-circus-lunch-box-for-kids": buildDigitalCircusLunchBoxPageContent(),
  "kitchen-cookware-buying-guide": buildKitchenCookwareBuyingGuidePageContent(),
  "jeans-denim-fit-guide": buildJeansDenimFitGuidePageContent(),
  "mobwol-watch-guide": buildMobwolWatchGuidePageContent(),
  "realme-buds-case-compatibility-guide": buildRealmeBudsCaseCompatibilityGuidePageContent(),
  "salt-earbuds-buying-guide": buildSaltEarbudsBuyingGuidePageContent(),
  "canvas-belt-sizing-style-guide": buildCanvasBeltSizingStyleGuidePageContent(),
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

const productDiscoveryGuideHandles = [
  "interactive-stem-assembly-activities-for-kids",
  "digital-circus-lunch-box-for-kids",
  "kitchen-cookware-buying-guide",
  "jeans-denim-fit-guide",
  "mobwol-watch-guide",
  "realme-buds-case-compatibility-guide",
  "salt-earbuds-buying-guide",
  "canvas-belt-sizing-style-guide",
] as const;

export function getEditorialGuidesForProductHandle(productHandle: string): EditorialPageContent[] {
  const normalizedProductHandle = String(productHandle || "").trim().toLowerCase();
  if (!normalizedProductHandle) {
    return [];
  }

  return productDiscoveryGuideHandles
    .map((guideHandle) => editorialPages[guideHandle])
    .filter(
      (guide): guide is EditorialPageContent =>
        Boolean(
          guide?.featuredProducts?.some(
            (featuredProduct) => featuredProduct.handle.trim().toLowerCase() === normalizedProductHandle,
          ),
        ),
    );
}

export function getEditorialPageContent(handle: string): EditorialPageContent | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    return null;
  }

  const directMatch = editorialPages[normalizedHandle];
  if (directMatch) {
    return ensureAnswerBlock(directMatch);
  }

  const [resourceCategorySegment, resourceTopicSegment] = normalizedHandle.split("/", 2);
  if (resourceCategorySegment && resourceTopicSegment) {
    const resourceGuide = getResourceByHandle(resourceCategorySegment);
    const resourceTopic = resourceGuide ? getResourceTopicByHandle(resourceCategorySegment, resourceTopicSegment) : null;
    if (resourceGuide && resourceTopic) {
      const resourcePage = editorialPages[`${resourceGuide.handle}/${resourceTopic.handle}`];
      return resourcePage ? ensureAnswerBlock(resourcePage) : null;
    }
  }

  const collectionMatch = getCollectionByHandle(normalizedHandle);
  if (collectionMatch) {
    const collectionPage = editorialPages[collectionMatch.handle];
    return collectionPage ? ensureAnswerBlock(collectionPage) : null;
  }

  const [collectionSegment, subcollectionSegment] = normalizedHandle.split("/", 2);
  if (collectionSegment && subcollectionSegment) {
    const nestedCollection = getCollectionByHandle(collectionSegment);
    const nestedSubcollection = nestedCollection ? getSubcollectionByHandle(collectionSegment, subcollectionSegment) : null;
    if (nestedCollection && nestedSubcollection) {
      const subcollectionPage = editorialPages[`${nestedCollection.handle}/${nestedSubcollection.handle}`];
      return subcollectionPage ? ensureAnswerBlock(subcollectionPage) : null;
    }
  }

  return null;
}

export function listEditorialPages(): EditorialPageContent[] {
  return Object.values(editorialPages).map(ensureAnswerBlock);
}
