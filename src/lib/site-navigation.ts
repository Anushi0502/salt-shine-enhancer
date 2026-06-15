export type SiteSubcollection = {
  title: string;
  handle: string;
  summary: string;
  searchQuery: string;
};

export type SiteCollection = {
  title: string;
  handle: string;
  summary: string;
  searchQuery: string;
  accent: {
    label: string;
    title: string;
    body: string;
    bullets: string[];
  };
  subcollections: SiteSubcollection[];
};

export type SiteResourceGuide = {
  title: string;
  handle: string;
  summary: string;
  searchQuery: string;
  bullets: string[];
};

export type SiteFooterLink = {
  label: string;
  to?: string;
  href?: string;
};

export const TRACK_ORDER_URL = "https://shopify.com/58076594275/account/orders";

export const SITE_COLLECTIONS: SiteCollection[] = [
  {
    title: "Senior Living Solutions",
    handle: "books",
    summary:
      "Practical daily supports for easier routines, safer rooms, stronger organization, and more confident independent living.",
    searchQuery: "senior living aids mobility support caregiver essentials home safety memory organization gifts for seniors",
    accent: {
      label: "Senior living route",
      title: "A calmer way to shop for everyday support",
      body:
        "Start with simple daily helpers, then narrow into home safety, memory support, caregiver essentials, and mobility-friendly tools that feel useful without feeling clinical.",
      bullets: ["Daily living aids", "Memory and organization", "Caregiver-friendly tools"],
    },
    subcollections: [
      {
        title: "Daily Living Aids",
        handle: "daily-living-aids",
        summary: "Easy-use helpers that make dressing, gripping, reaching, and routine tasks feel lighter.",
        searchQuery: "daily living aids easy use helpers",
      },
      {
        title: "Home Safety",
        handle: "home-safety",
        summary: "Safer bath, hallway, and room solutions that reduce friction around the home.",
        searchQuery: "home safety bathroom hallway support",
      },
      {
        title: "Memory & Organization",
        handle: "memory-organization",
        summary: "Planners, reminders, labels, and simple systems that keep the day on track.",
        searchQuery: "memory organization planner reminders labels",
      },
      {
        title: "Caregiver Essentials",
        handle: "caregiver-essentials",
        summary: "Tools that make caregiving more organized, calm, and straightforward.",
        searchQuery: "caregiver essentials support organization",
      },
      {
        title: "Gifts for Seniors",
        handle: "gifts-for-seniors",
        summary: "Thoughtful gift ideas that feel personal, practical, and easy to appreciate.",
        searchQuery: "gifts for seniors thoughtful practical",
      },
      {
        title: "Mobility Support",
        handle: "mobility-support",
        summary: "Comfortable supports for balance, movement, and around-the-home travel.",
        searchQuery: "mobility support balance movement",
      },
    ],
  },
  {
    title: "Home & Kitchen",
    handle: "cookware",
    summary:
      "Useful kitchen, dining, storage, and clean-up essentials that make everyday routines easier to manage.",
    searchQuery: "home kitchen cookware storage coffee tea dining cleaning decor lighting",
    accent: {
      label: "Kitchen route",
      title: "Built for daily use, not clutter",
      body:
        "This collection keeps cooking, storing, cleaning, and serving organized so shoppers can move from inspiration to a working kitchen setup faster.",
      bullets: ["Cookware and gadgets", "Storage and organization", "Coffee and tea accessories"],
    },
    subcollections: [
      {
        title: "Kitchen Gadgets",
        handle: "kitchen-gadgets",
        summary: "Smart little helpers that speed up prep, serving, and cleanup.",
        searchQuery: "kitchen gadgets prep serving cleanup",
      },
      {
        title: "Cookware",
        handle: "cookware",
        summary: "Pans, pots, and cooking tools that work for real everyday meals.",
        searchQuery: "cookware pans pots cooking",
      },
      {
        title: "Storage & Organization",
        handle: "storage-organization",
        summary: "Keep shelves, cabinets, and counters neat with space-saving organization.",
        searchQuery: "storage organization kitchen containers",
      },
      {
        title: "Coffee & Tea Accessories",
        handle: "coffee-tea-accessories",
        summary: "Morning-friendly accessories for brewing, serving, and enjoying a pause.",
        searchQuery: "coffee tea accessories brewer mug",
      },
      {
        title: "Dining Essentials",
        handle: "dining-essentials",
        summary: "Serving and table basics that make meals feel settled and complete.",
        searchQuery: "dining essentials table serving",
      },
      {
        title: "Cleaning Tools",
        handle: "cleaning-tools",
        summary: "Practical tools for the jobs that keep kitchens and homes feeling fresh.",
        searchQuery: "cleaning tools kitchen home",
      },
      {
        title: "Home Decor & Lighting",
        handle: "home-decor-lighting",
        summary: "Warm accents and lighting that make the room feel finished.",
        searchQuery: "home decor lighting lamps wall art decor accessories",
      },
    ],
  },
  {
    title: "Home Decor & Lighting",
    handle: "home-decor",
    summary:
      "Lighting and decorative touches that warm a room, highlight a wall, and finish a space with intention.",
    searchQuery: "home decor lighting wall lights decorative lamps wall art seasonal decor smart lighting accessories",
    accent: {
      label: "Decor route",
      title: "Finish the room, not just fill it",
      body:
        "Use lighting, wall art, decorative accents, and seasonal pieces to give the space depth, warmth, and a clear point of view.",
      bullets: ["Wall lights", "Decorative lamps", "Seasonal pieces"],
    },
    subcollections: [
      {
        title: "Wall Lights",
        handle: "wall-lights",
        summary: "Mounted lighting that adds shape, glow, and function.",
        searchQuery: "wall lights mounted lighting",
      },
      {
        title: "Decorative Lamps",
        handle: "decorative-lamps",
        summary: "Table and floor lamps that bring warmth and character.",
        searchQuery: "decorative lamps table floor lights",
      },
      {
        title: "Wall Art",
        handle: "wall-art",
        summary: "Artwork and wall decor that turn blank space into a finished room.",
        searchQuery: "wall art decor prints",
      },
      {
        title: "Seasonal Decor",
        handle: "seasonal-decor",
        summary: "Rotating accents for holidays, transitions, and special moments.",
        searchQuery: "seasonal decor holiday home accents",
      },
      {
        title: "Smart Lighting",
        handle: "smart-lighting",
        summary: "Connected lighting for more control, better mood, and easier routines.",
        searchQuery: "smart lighting home control",
      },
      {
        title: "Decorative Accessories",
        handle: "decorative-accessories",
        summary: "Small accents that bring the room together without overfilling it.",
        searchQuery: "decorative accessories home accents",
      },
      {
        title: "Pet Essentials",
        handle: "pet-essentials",
        summary: "A practical cross-shop for pet-friendly home routines and organization.",
        searchQuery: "pet essentials home pet",
      },
    ],
  },
  {
    title: "Pet Essentials",
    handle: "pet-assocerries",
    summary: "Feeding, grooming, travel, and play basics for dogs and cats that keep pet care straightforward.",
    searchQuery: "pet essentials dog supplies cat supplies pet travel feeding grooming toys wellness",
    accent: {
      label: "Pet route",
      title: "Care that feels simple for pets and people",
      body:
        "From feeding to grooming, the goal is to make the everyday pet routine easier to keep up with and easier to trust.",
      bullets: ["Dog and cat supplies", "Travel and feeding", "Pet grooming and toys"],
    },
    subcollections: [
      {
        title: "Dog Supplies",
        handle: "dog-supplies",
        summary: "Dog-friendly basics for feeding, play, travel, and daily care.",
        searchQuery: "dog supplies feeding toys travel care",
      },
      {
        title: "Cat Supplies",
        handle: "cat-supplies",
        summary: "Cat essentials for feeding, comfort, play, and grooming.",
        searchQuery: "cat supplies feeding toys grooming care",
      },
      {
        title: "Pet Travel",
        handle: "pet-travel",
        summary: "Portable solutions for road trips, appointments, and overnight stays.",
        searchQuery: "pet travel carrier portable",
      },
      {
        title: "Pet Feeding",
        handle: "pet-feeding",
        summary: "Feeding tools and accessories for a cleaner routine.",
        searchQuery: "pet feeding bowls mats accessories",
      },
      {
        title: "Pet Grooming",
        handle: "pet-grooming",
        summary: "Basic grooming helpers that keep the routine manageable.",
        searchQuery: "pet grooming brush clean",
      },
      {
        title: "Pet Toys",
        handle: "pet-toys",
        summary: "Play-first picks that help pets stay engaged and active.",
        searchQuery: "pet toys play interactive",
      },
      {
        title: "Health & Wellness",
        handle: "health-wellness",
        summary: "Pet wellness overlap for everyday care and comfort.",
        searchQuery: "pet health wellness comfort care",
      },
    ],
  },
  {
    title: "Health & Wellness",
    handle: "face-mask",
    summary: "Sleep, posture, relaxation, and recovery-focused products for everyday wellbeing.",
    searchQuery: "health wellness posture sleep relaxation massage accessories travel outdoor",
    accent: {
      label: "Wellness route",
      title: "Comfort-oriented products for calmer routines",
      body:
        "This collection keeps posture support, sleep, relaxation, massage, and wellbeing accessories in one place so shoppers can move from symptom to solution faster.",
      bullets: ["Posture support", "Sleep essentials", "Relaxation products"],
    },
    subcollections: [
      {
        title: "Posture Support",
        handle: "posture-support",
        summary: "Support-focused products for better alignment and daily comfort.",
        searchQuery: "posture support comfort alignment",
      },
      {
        title: "Sleep Essentials",
        handle: "sleep-essentials",
        summary: "Tools that help the bedroom feel more restful and prepared.",
        searchQuery: "sleep essentials rest comfort",
      },
      {
        title: "Relaxation Products",
        handle: "relaxation-products",
        summary: "Calm-first picks for winding down after busy days.",
        searchQuery: "relaxation products calm stress relief",
      },
      {
        title: "Massage Tools",
        handle: "massage-tools",
        summary: "Massage accessories for tension relief and everyday recovery.",
        searchQuery: "massage tools recovery relaxation",
      },
      {
        title: "Wellness Accessories",
        handle: "wellness-accessories",
        summary: "Small accessories that support balance, consistency, and self-care.",
        searchQuery: "wellness accessories self care",
      },
      {
        title: "Travel & Outdoor",
        handle: "travel-outdoor",
        summary: "Portable support for on-the-go routines and outdoor days.",
        searchQuery: "travel outdoor portable wellness",
      },
    ],
  },
  {
    title: "Travel & Outdoor",
    handle: "shopping-bags-jute-bags",
    summary: "Portable helpers for road trips, camping, and organized travel days that stay easy to pack.",
    searchQuery: "travel outdoor organizers car accessories camping gear portable gadgets outdoor essentials",
    accent: {
      label: "Travel route",
      title: "Pack lighter and move easier",
      body:
        "Keep travel organized with small, practical items that save space, reduce friction, and make the drive or campsite feel more manageable.",
      bullets: ["Travel organizers", "Car accessories", "Camping gear"],
    },
    subcollections: [
      {
        title: "Travel Organizers",
        handle: "travel-organizers",
        summary: "Pouches, cases, and organizers that make packing and unpacking easier.",
        searchQuery: "travel organizers packing cases pouches",
      },
      {
        title: "Car Accessories",
        handle: "car-accessories",
        summary: "On-the-road add-ons that make the cabin feel more usable.",
        searchQuery: "car accessories travel road",
      },
      {
        title: "Camping Gear",
        handle: "camping-gear",
        summary: "Simple gear for campsites, tailgates, and outdoor stays.",
        searchQuery: "camping gear outdoor stay",
      },
      {
        title: "Portable Gadgets",
        handle: "portable-gadgets",
        summary: "Battery-friendly tools and portable helpers that travel well.",
        searchQuery: "portable gadgets travel compact",
      },
      {
        title: "Outdoor Essentials",
        handle: "outdoor-essentials",
        summary: "Reliable basics for picnics, patios, and time outside.",
        searchQuery: "outdoor essentials patio picnic",
      },
    ],
  },
  {
    title: "Gifts Collection",
    handle: "gifts",
    summary:
      "Giftable finds for birthdays, holidays, housewarmings, and everyday surprises that feel useful and thoughtful.",
    searchQuery: "gifts for mom gifts for dad gifts for seniors housewarming birthday holiday gift ideas",
    accent: {
      label: "Gift route",
      title: "Choose a present people can actually use",
      body:
        "This collection keeps the gift search practical: useful ideas for moments when you want the gesture to feel thoughtful, not random.",
      bullets: ["Mom and dad gifts", "Housewarming ideas", "Birthday and holiday picks"],
    },
    subcollections: [
      {
        title: "Gifts for Mom",
        handle: "gifts-for-mom",
        summary: "Warm and practical gift ideas for moms.",
        searchQuery: "gifts for mom thoughtful practical",
      },
      {
        title: "Gifts for Dad",
        handle: "gifts-for-dad",
        summary: "Useful gifts that feel easy to appreciate and easy to use.",
        searchQuery: "gifts for dad practical useful",
      },
      {
        title: "Gifts for Seniors",
        handle: "gifts-for-seniors",
        summary: "Helpful gifts that support comfort, organization, and daily life.",
        searchQuery: "gifts for seniors helpful comfort",
      },
      {
        title: "Housewarming Gifts",
        handle: "housewarming-gifts",
        summary: "New-home gifts that make a fresh space feel settled sooner.",
        searchQuery: "housewarming gifts home",
      },
      {
        title: "Birthday Gifts",
        handle: "birthday-gifts",
        summary: "Birthday picks that are easy to match with the person and the moment.",
        searchQuery: "birthday gifts surprise",
      },
      {
        title: "Holiday Gifts",
        handle: "holiday-gifts",
        summary: "Seasonal picks for winter, celebrations, and gifting rushes.",
        searchQuery: "holiday gifts seasonal",
      },
    ],
  },
  {
    title: "Trending Finds",
    handle: "unique-products",
    summary:
      "What’s moving now: viral picks, best sellers, new arrivals, staff picks, and budget-friendly favorites.",
    searchQuery: "viral tiktok products best sellers new arrivals staff picks under 25 under 50 trending finds",
    accent: {
      label: "Trending route",
      title: "Keep the page fresh without rebuilding the catalog",
      body:
        "This collection is shaped for discovery speed: shoppers can jump into what's new, what’s selling, and what feels worth the price.",
      bullets: ["Viral picks", "Best sellers", "Under $25 and under $50"],
    },
    subcollections: [
      {
        title: "Viral TikTok Products",
        handle: "viral-tiktok-products",
        summary: "Social-first picks that capture attention quickly.",
        searchQuery: "viral tiktok products trending",
      },
      {
        title: "Best Sellers",
        handle: "best-sellers",
        summary: "The most consistently chosen items from the current catalog.",
        searchQuery: "best sellers top rated popular",
      },
      {
        title: "New Arrivals",
        handle: "new-arrivals",
        summary: "Fresh additions to the store for repeat visitors and launch traffic.",
        searchQuery: "new arrivals fresh drops",
      },
      {
        title: "Staff Picks",
        handle: "staff-picks",
        summary: "Hand-picked ideas from the SALT team.",
        searchQuery: "staff picks curated favorites",
      },
      {
        title: "Under $25",
        handle: "under-25",
        summary: "Budget-friendly finds for quick add-to-cart decisions.",
        searchQuery: "under 25 budget affordable",
      },
      {
        title: "Under $50",
        handle: "under-50",
        summary: "Still affordable, but a little roomier in what can fit inside.",
        searchQuery: "under 50 budget affordable",
      },
    ],
  },
];

export const SITE_RESOURCE_GUIDES: SiteResourceGuide[] = [
  {
    title: "Senior Living Guides",
    handle: "senior-living-guides",
    summary: "Practical checklists and buyer-friendly advice for safer, calmer living at home.",
    searchQuery: "senior living guides caregiving daily living safety",
    bullets: ["Senior product checklists", "Caregiver planning tips", "Home safety buying cues"],
  },
  {
    title: "Home Organization Ideas",
    handle: "home-organization-ideas",
    summary: "Simple systems for closets, counters, drawers, and small-space routines.",
    searchQuery: "home organization ideas small apartment solutions",
    bullets: ["Room-by-room ideas", "Small-space storage", "Declutter-first routines"],
  },
  {
    title: "Kitchen Guides",
    handle: "kitchen-guides",
    summary: "Kitchen buying guides that make it easier to choose the right tools the first time.",
    searchQuery: "kitchen guides best kitchen gadgets cooking essentials",
    bullets: ["Tool comparison posts", "Cookware selection tips", "Cleanup-friendly routines"],
  },
  {
    title: "Pet Care Guides",
    handle: "pet-care-guides",
    summary: "Feeding, travel, grooming, and organization advice for pets and their people.",
    searchQuery: "pet care guides pet travel tips pet organization",
    bullets: ["Feeding and travel", "Grooming and toys", "Pet organization"],
  },
  {
    title: "Gift Guides",
    handle: "gift-guides",
    summary: "Occasion-led gift ideas for moms, dads, seniors, holidays, and housewarmings.",
    searchQuery: "gift guides best gifts for mom best gifts for dad holiday gift ideas",
    bullets: ["Occasion-led inspiration", "Budget and value choices", "Seasonal gift planning"],
  },
];

export const SITE_FOOTER_COMPANY_LINKS: SiteFooterLink[] = [
  { label: "About SALT", to: "/about" },
  { label: "Contact Us", to: "/contact" },
  { label: "Track Order", href: TRACK_ORDER_URL },
  { label: "FAQ", to: "/faq" },
];

export const SITE_FOOTER_RESOURCE_LINKS: SiteFooterLink[] = [
  { label: "Resource Hub", to: "/resources" },
  { label: "Blog", to: "/blog" },
  { label: "Wholesale Inquiries", to: "/wholesale-inquiries" },
  { label: "Affiliate Program", to: "/affiliate-program" },
];

export const SITE_FOOTER_POLICY_LINKS: SiteFooterLink[] = [
  { label: "Shipping Policy", to: "/shipping-policy" },
  { label: "Return Policy", to: "/refund-policy" },
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms & Conditions", to: "/terms-conditions" },
];

export function getCollectionByHandle(handle: string): SiteCollection | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  return SITE_COLLECTIONS.find((collection) => collection.handle === normalizedHandle) || null;
}

export function getSubcollectionByHandle(collectionHandle: string, subcollectionHandle: string): SiteSubcollection | null {
  const collection = getCollectionByHandle(collectionHandle);
  if (!collection) {
    return null;
  }

  const normalizedSubHandle = String(subcollectionHandle || "").trim().toLowerCase();
  return collection.subcollections.find((subcollection) => subcollection.handle === normalizedSubHandle) || null;
}

export function getResourceByHandle(handle: string): SiteResourceGuide | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  return SITE_RESOURCE_GUIDES.find((guide) => guide.handle === normalizedHandle) || null;
}

export function isFeaturedCollectionHandle(handle: string): boolean {
  return Boolean(getCollectionByHandle(handle));
}

export function buildCollectionRoute(collectionHandle: string): string {
  return `/collections/${String(collectionHandle || "").trim().toLowerCase()}`;
}

export function buildSubcollectionRoute(collectionHandle: string, subcollectionHandle: string): string {
  return `${buildCollectionRoute(collectionHandle)}/${String(subcollectionHandle || "").trim().toLowerCase()}`;
}

export function buildResourceRoute(handle: string): string {
  return `/resources/${String(handle || "").trim().toLowerCase()}`;
}

export function buildSearchQueryUrl(query: string): string {
  const normalizedQuery = String(query || "").trim();
  return normalizedQuery ? `/shop?q=${encodeURIComponent(normalizedQuery)}` : "/shop";
}
