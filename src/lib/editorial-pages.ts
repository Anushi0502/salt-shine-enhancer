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
  to: string;
  primary?: boolean;
};

export type EditorialPageContent = {
  handle: string;
  kicker: string;
  title: string;
  summary: string;
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
  actions: EditorialAction[];
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
      { label: "About SALT", to: "/about", primary: true },
      { label: "Contact support", to: "/contact" },
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
      { label: "Contact the team", to: "/contact", primary: true },
      { label: "About SALT", to: "/about" },
      { label: "Mission & Vision", to: "/pages/mission-vision" },
    ],
  },
};

export function getEditorialPageContent(handle: string): EditorialPageContent | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  return editorialPages[normalizedHandle] || null;
}

export function listEditorialPages(): EditorialPageContent[] {
  return Object.values(editorialPages);
}

