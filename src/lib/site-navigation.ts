import { RESOURCE_HUB_GUIDES } from "@/lib/resource-hub-data";

export type SiteSubcollection = {
  title: string;
  handle: string;
  shopifyHandle?: string;
  priceFilter?: {
    min?: number;
    max?: number;
  };
  summary: string;
  searchQuery: string;
};

export type SiteCollection = {
  title: string;
  handle: string;
  shopifyHandle: string;
  summary: string;
  searchQuery: string;
  scope?: {
    include: string[];
    exclude: string[];
  };
  accent: {
    label: string;
    title: string;
    body: string;
    bullets: string[];
  };
  subcollections: SiteSubcollection[];
};

export type SiteResourceFeaturedProduct = {
  handle: string;
};

export type SiteResourceTopic = {
  title: string;
  handle: string;
  summary: string;
  collectionRoute: string;
  featuredProducts: SiteResourceFeaturedProduct[];
};

export type SiteResourceGuide = {
  title: string;
  handle: string;
  summary: string;
  collectionRoute: string;
  featuredProducts: SiteResourceFeaturedProduct[];
  topics: SiteResourceTopic[];
};

export type SiteFooterLink = {
  label: string;
  to?: string;
  href?: string;
};

export const TRACK_ORDER_URL = "https://shopify.com/58076594275/account/orders";

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const APPAREL_SCOPE_EXCLUDES = [
  "shirt",
  "t-shirt",
  "tee",
  "top",
  "dress",
  "robe",
  "trouser",
  "trousers",
  "pant",
  "pants",
  "jeans",
  "skirt",
  "jacket",
  "hoodie",
  "sweatshirt",
  "blouse",
  "shorts",
];

const HOME_KITCHEN_SCOPE_INCLUDES = [
  "kitchen",
  "cookware",
  "cook",
  "pan",
  "pot",
  "bowl",
  "utensil",
  "spoon",
  "spatula",
  "jar",
  "opener",
  "lid",
  "storage",
  "organizer",
  "coffee",
  "tea",
  "dining",
  "cleaning",
  "sink",
];

const HOME_DECOR_SCOPE_INCLUDES = [
  "decor",
  "lighting",
  "light",
  "lamp",
  "wall",
  "art",
  "candle",
  "seasonal",
  "accent",
  "vase",
  "smart",
];

const PET_SCOPE_INCLUDES = [
  "pet",
  "dog",
  "cat",
  "feeding",
  "feed",
  "groom",
  "toy",
  "travel",
  "bowl",
  "carrier",
  "collar",
  "leash",
  "mat",
  "care",
];

const HEALTH_SCOPE_INCLUDES = [
  "mask",
  "balaclava",
  "thermal",
  "breath",
  "posture",
  "sleep",
  "relax",
  "massage",
  "wellness",
  "support",
  "recovery",
  "neck",
  "winter",
];

const TRAVEL_SCOPE_INCLUDES = [
  "travel",
  "outdoor",
  "camp",
  "camping",
  "portable",
  "bag",
  "trolley",
  "car",
  "organizer",
  "road",
  "gadget",
  "pack",
];

const SENIOR_SCOPE_INCLUDES = [
  "senior",
  "living",
  "daily",
  "caregiver",
  "memory",
  "organization",
  "organizer",
  "planner",
  "book",
  "books",
  "safety",
  "mobility",
  "support",
  "aid",
  "reach",
  "grip",
];

const GIFT_SCOPE_INCLUDES = [
  "gift",
  "gifts",
  "housewarming",
  "birthday",
  "holiday",
  "mom",
  "dad",
  "senior",
  "present",
  "giftable",
];

const TRENDING_SCOPE_INCLUDES = [
  "viral",
  "trending",
  "best",
  "new",
  "staff",
  "under",
  "deal",
  "sale",
  "bestseller",
  "unique",
  "pick",
  "find",
];

export type SiteHomeCollectionGroup = {
  handle: string;
  label: string;
  childHandles: string[];
};

export type SiteFeaturedShortcut = {
  label: string;
  preferredHandles: string[];
};

export const SITE_HOME_COLLECTION_GROUPS: SiteHomeCollectionGroup[] = [
  {
    handle: "cookware",
    label: "Home & Kitchen",
    childHandles: [
      "kitchen-gadgets",
      "cookware",
      "storage-organization",
      "coffee-tea-accessories",
      "dining-essentials",
      "cleaning-tools",
    ],
  },
  {
    handle: "home-decor",
    label: "Home Decor & Lighting",
    childHandles: [
      "wall-lights",
      "decorative-lamps",
      "wall-art",
      "seasonal-decor",
      "smart-lighting",
      "decorative-accessories",
    ],
  },
  {
    handle: "pet-assocerries",
    label: "Pet Essentials",
    childHandles: ["dog-supplies", "cat-supplies", "pet-travel", "pet-feeding", "pet-grooming", "pet-toys"],
  },
  {
    handle: "face-mask",
    label: "Health & Wellness",
    childHandles: [
      "posture-support",
      "sleep-essentials",
      "relaxation-products",
      "massage-tools",
      "wellness-accessories",
    ],
  },
  {
    handle: "shopping-bags-jute-bags",
    label: "Travel & Outdoor",
    childHandles: ["travel-organizers", "car-accessories", "camping-gear", "portable-gadgets", "outdoor-essentials"],
  },
  {
    handle: "books",
    label: "Senior Living Solutions",
    childHandles: [
      "daily-living-aids",
      "home-safety",
      "memory-organization",
      "caregiver-essentials",
      "gifts-for-seniors",
      "mobility-support",
    ],
  },
  {
    handle: "gifts",
    label: "Gifts Collection",
    childHandles: ["gifts-for-mom", "gifts-for-dad", "gifts-for-seniors", "housewarming-gifts", "birthday-gifts", "holiday-gifts"],
  },
  {
    handle: "unique-products",
    label: "Trending Finds",
    childHandles: ["viral-tiktok-products", "appplaza-best-sellers", "new-arrivals", "staff-picks", "under-25", "under-50"],
  },
];

export const SITE_HOME_FEATURED_SHORTCUTS: SiteFeaturedShortcut[] = [
  {
    label: "New Arrivals",
    preferredHandles: ["new-arrivals"],
  },
  {
    label: "Best Sellers",
    preferredHandles: ["appplaza-best-sellers", "best-sellers"],
  },
  {
    label: "Today's Deals",
    preferredHandles: ["todays-deals", "deals-sale"],
  },
];

const COLLECTION_ROUTE_ALIASES: Record<string, string> = {
  apparel: "men-collection",
  "cooking-essential": "cookware",
  "winter-wear": "clearance-archive",
};

const COLLECTION_ROUTE_ALIAS_SOURCES_BY_TARGET = Object.entries(COLLECTION_ROUTE_ALIASES).reduce<
  Record<string, string[]>
>((accumulator, [sourceHandle, targetHandle]) => {
  const normalizedTargetHandle = normalizeHandle(targetHandle);
  if (!normalizedTargetHandle) {
    return accumulator;
  }

  const normalizedSourceHandle = normalizeHandle(sourceHandle);
  if (!normalizedSourceHandle) {
    return accumulator;
  }

  const sources = accumulator[normalizedTargetHandle] || [];
  if (!sources.includes(normalizedSourceHandle)) {
    sources.push(normalizedSourceHandle);
  }

  accumulator[normalizedTargetHandle] = sources;
  return accumulator;
}, {});

function resolveCollectionRouteAlias(handle: string | null | undefined): string {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return "";
  }

  return COLLECTION_ROUTE_ALIASES[normalizedHandle] || normalizedHandle;
}

function getCollectionRouteAliasSources(handle: string | null | undefined): string[] {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return [];
  }

  return COLLECTION_ROUTE_ALIAS_SOURCES_BY_TARGET[normalizedHandle] || [];
}

export function getMergedCollectionHandles(handle: string): string[] {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return [];
  }

  const canonicalHandle = resolveCollectionRouteAlias(normalizedHandle);
  const mergedHandles = [normalizedHandle, canonicalHandle, ...getCollectionRouteAliasSources(canonicalHandle)];

  return Array.from(new Set(mergedHandles.map((entry) => normalizeHandle(entry)).filter(Boolean)));
}

export const SITE_COLLECTIONS: SiteCollection[] = [
  {
    title: "Home & Kitchen",
    handle: "home-kitchen",
    shopifyHandle: "cookware",
    summary:
      "Useful kitchen, dining, storage, and clean-up essentials that make everyday routines easier to manage.",
    searchQuery: "cookware",
    scope: {
      include: HOME_KITCHEN_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "gadget",
      },
      {
        title: "Cookware",
        handle: "cookware",
        shopifyHandle: "cookware",
        summary: "Pans, pots, and cooking tools that work for real everyday meals.",
        searchQuery: "cookware pans pots cooking",
      },
      {
        title: "Storage & Organization",
        handle: "storage-organization",
        summary: "Keep shelves, cabinets, and counters neat with space-saving organization.",
        searchQuery: "organizer",
      },
      {
        title: "Coffee & Tea Accessories",
        handle: "coffee-tea-accessories",
        summary: "Morning-friendly accessories for brewing, serving, and enjoying a pause.",
        searchQuery: "tea",
      },
      {
        title: "Dining Essentials",
        handle: "dining-essentials",
        summary: "Serving and table basics that make meals feel settled and complete.",
        searchQuery: "bowl",
      },
      {
        title: "Cleaning Tools",
        handle: "cleaning-tools",
        summary: "Practical tools for the jobs that keep kitchens and homes feeling fresh.",
        searchQuery: "cleaning",
      },
    ],
  },
  {
    title: "Home Decor & Lighting",
    handle: "home-decor-lighting",
    shopifyHandle: "home-decor",
    summary:
      "Lighting and decorative touches that warm a room, highlight a wall, and finish a space with intention.",
    searchQuery: "decor",
    scope: {
      include: HOME_DECOR_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "wall",
      },
      {
        title: "Decorative Lamps",
        handle: "decorative-lamps",
        summary: "Table and floor lamps that bring warmth and character.",
        searchQuery: "lamp",
      },
      {
        title: "Wall Art",
        handle: "wall-art",
        summary: "Artwork and wall decor that turn blank space into a finished room.",
        searchQuery: "art",
      },
      {
        title: "Seasonal Decor",
        handle: "seasonal-decor",
        summary: "Rotating accents for holidays, transitions, and special moments.",
        searchQuery: "decor",
      },
      {
        title: "Smart Lighting",
        handle: "smart-lighting",
        summary: "Connected lighting for more control, better mood, and easier routines.",
        searchQuery: "light",
      },
      {
        title: "Decorative Accessories",
        handle: "decorative-accessories",
        summary: "Small accents that bring the room together without overfilling it.",
        searchQuery: "decor",
      },
    ],
  },
  {
    title: "Pet Essentials",
    handle: "pet-essentials",
    shopifyHandle: "pet-assocerries",
    summary: "Feeding, grooming, travel, and play basics for dogs and cats that keep pet care straightforward.",
    searchQuery: "pet",
    scope: {
      include: PET_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "dog",
      },
      {
        title: "Cat Supplies",
        handle: "cat-supplies",
        summary: "Cat essentials for feeding, comfort, play, and grooming.",
        searchQuery: "cat",
      },
      {
        title: "Pet Travel",
        handle: "pet-travel",
        summary: "Portable solutions for road trips, appointments, and overnight stays.",
        searchQuery: "travel",
      },
      {
        title: "Pet Feeding",
        handle: "pet-feeding",
        summary: "Feeding tools and accessories for a cleaner routine.",
        searchQuery: "feeding",
      },
      {
        title: "Pet Grooming",
        handle: "pet-grooming",
        summary: "Basic grooming helpers that keep the routine manageable.",
        searchQuery: "grooming",
      },
      {
        title: "Pet Toys",
        handle: "pet-toys",
        summary: "Play-first picks that help pets stay engaged and active.",
        searchQuery: "toy",
      },
    ],
  },
  {
    title: "Health & Wellness",
    handle: "health-wellness",
    shopifyHandle: "face-mask",
    summary: "Sleep, posture, relaxation, and recovery-focused products for everyday wellbeing.",
    searchQuery: "mask",
    scope: {
      include: HEALTH_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "windproof",
      },
      {
        title: "Sleep Essentials",
        handle: "sleep-essentials",
        summary: "Tools that help the bedroom feel more restful and prepared.",
        searchQuery: "winter",
      },
      {
        title: "Relaxation Products",
        handle: "relaxation-products",
        summary: "Calm-first picks for winding down after busy days.",
        searchQuery: "breathable",
      },
      {
        title: "Massage Tools",
        handle: "massage-tools",
        summary: "Massage accessories for tension relief and everyday recovery.",
        searchQuery: "cycling",
      },
      {
        title: "Wellness Accessories",
        handle: "wellness-accessories",
        summary: "Small accessories that support balance, consistency, and self-care.",
        searchQuery: "uv",
      },
    ],
  },
  {
    title: "Travel & Outdoor",
    handle: "travel-outdoor",
    shopifyHandle: "shopping-bags-jute-bags",
    summary: "Portable helpers for road trips, camping, and organized travel days that stay easy to pack.",
    searchQuery: "travel",
    scope: {
      include: TRAVEL_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "organizer",
      },
      {
        title: "Car Accessories",
        handle: "car-accessories",
        summary: "On-the-road add-ons that make the cabin feel more usable.",
        searchQuery: "car",
      },
      {
        title: "Camping Gear",
        handle: "camping-gear",
        summary: "Simple gear for campsites, tailgates, and outdoor stays.",
        searchQuery: "travel",
      },
      {
        title: "Portable Gadgets",
        handle: "portable-gadgets",
        summary: "Battery-friendly tools and portable helpers that travel well.",
        searchQuery: "portable",
      },
      {
        title: "Outdoor Essentials",
        handle: "outdoor-essentials",
        summary: "Reliable basics for picnics, patios, and time outside.",
        searchQuery: "portable",
      },
    ],
  },
  {
    title: "Senior Living Solutions",
    handle: "senior-living-solutions",
    shopifyHandle: "books",
    summary:
      "Practical daily supports for easier routines, safer rooms, stronger organization, and more confident independent living.",
    searchQuery: "planner",
    scope: {
      include: SENIOR_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "planner",
      },
      {
        title: "Home Safety",
        handle: "home-safety",
        summary: "Safer bath, hallway, and room solutions that reduce friction around the home.",
        searchQuery: "self-help",
      },
      {
        title: "Memory & Organization",
        handle: "memory-organization",
        summary: "Planners, reminders, labels, and simple systems that keep the day on track.",
        searchQuery: "goal setting",
      },
      {
        title: "Caregiver Essentials",
        handle: "caregiver-essentials",
        summary: "Tools that make caregiving more organized, calm, and straightforward.",
        searchQuery: "tracker",
      },
      {
        title: "Gifts for Seniors",
        handle: "gifts-for-seniors",
        shopifyHandle: "gifts",
        summary: "Thoughtful gift ideas that feel personal, practical, and easy to appreciate.",
        searchQuery: "gifts for seniors thoughtful practical",
      },
      {
        title: "Mobility Support",
        handle: "mobility-support",
        summary: "Comfortable supports for balance, movement, and around-the-home travel.",
        searchQuery: "exercise",
      },
    ],
  },
  {
    title: "Gifts Collection",
    handle: "gifts",
    shopifyHandle: "gifts",
    summary:
      "Giftable finds for birthdays, holidays, housewarmings, and everyday surprises that feel useful and thoughtful.",
    searchQuery: "gift",
    scope: {
      include: GIFT_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "gift",
      },
      {
        title: "Gifts for Dad",
        handle: "gifts-for-dad",
        summary: "Useful gifts that feel easy to appreciate and easy to use.",
        searchQuery: "gift",
      },
      {
        title: "Gifts for Seniors",
        handle: "gifts-for-seniors",
        summary: "Helpful gifts that support comfort, organization, and daily life.",
        searchQuery: "gift",
      },
      {
        title: "Housewarming Gifts",
        handle: "housewarming-gifts",
        summary: "New-home gifts that make a fresh space feel settled sooner.",
        searchQuery: "gift",
      },
      {
        title: "Birthday Gifts",
        handle: "birthday-gifts",
        summary: "Birthday picks that are easy to match with the person and the moment.",
        searchQuery: "birthday",
      },
      {
        title: "Holiday Gifts",
        handle: "holiday-gifts",
        summary: "Seasonal picks for winter, celebrations, and gifting rushes.",
        searchQuery: "candle",
      },
    ],
  },
  {
    title: "Trending Finds",
    handle: "trending-finds",
    shopifyHandle: "unique-products",
    summary:
      "What’s moving now: viral picks, best sellers, new arrivals, staff picks, and budget-friendly favorites.",
    searchQuery: "humidifier",
    scope: {
      include: TRENDING_SCOPE_INCLUDES,
      exclude: APPAREL_SCOPE_EXCLUDES,
    },
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
        searchQuery: "humidifier",
      },
      {
        title: "Best Sellers",
        handle: "best-sellers",
        shopifyHandle: "appplaza-best-sellers",
        summary: "The most consistently chosen items from the current catalog.",
        searchQuery: "best sellers",
      },
      {
        title: "New Arrivals",
        handle: "new-arrivals",
        shopifyHandle: "new-arrivals",
        summary: "Fresh additions to the store for repeat visitors and launch traffic.",
        searchQuery: "new arrivals",
      },
      {
        title: "Staff Picks",
        handle: "staff-picks",
        summary: "Hand-picked ideas from the SALT team.",
        searchQuery: "clock",
      },
      {
        title: "Under $25",
        handle: "under-25",
        priceFilter: {
          max: 25,
        },
        summary: "Budget-friendly finds for quick add-to-cart decisions.",
        searchQuery: "gift",
      },
      {
        title: "Under $50",
        handle: "under-50",
        priceFilter: {
          max: 50,
        },
        summary: "Still affordable, but a little roomier in what can fit inside.",
        searchQuery: "gift",
      },
    ],
  },
];

export type SiteHeaderCollectionLink = {
  label: string;
  routeHandle: string;
  activeCollectionHandles: string[];
  to: string;
};

export const SITE_HEADER_COLLECTION_LINKS: SiteHeaderCollectionLink[] = SITE_COLLECTIONS.map((collection) => ({
  label: collection.title,
  routeHandle: collection.shopifyHandle || collection.handle,
  activeCollectionHandles: Array.from(
    new Set([
      collection.handle,
      collection.shopifyHandle,
      ...collection.subcollections.map((subcollection) => subcollection.handle),
      ...collection.subcollections.map((subcollection) => subcollection.shopifyHandle),
    ].filter(Boolean)),
  ),
  to: `/collections/${normalizeHandle(collection.shopifyHandle || collection.handle)}`,
}));

export const SITE_RESOURCE_GUIDES: SiteResourceGuide[] = RESOURCE_HUB_GUIDES;

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

function findCollectionMatch(handle: string): SiteCollection | null {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return null;
  }

  const canonicalHandle = resolveCollectionRouteAlias(normalizedHandle);

  return (
    SITE_COLLECTIONS.find(
      (collection) =>
        collection.handle === normalizedHandle ||
        collection.shopifyHandle === normalizedHandle ||
        collection.handle === canonicalHandle ||
        collection.shopifyHandle === canonicalHandle,
    ) || null
  );
}

function findSubcollectionMatch(collection: SiteCollection, handle: string): SiteSubcollection | null {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    return null;
  }

  return (
    collection.subcollections.find(
      (subcollection) => subcollection.handle === normalizedHandle || subcollection.shopifyHandle === normalizedHandle,
    ) || null
  );
}

export function getCollectionByHandle(handle: string): SiteCollection | null {
  return findCollectionMatch(handle);
}

export function resolveCollectionRouteHandle(handle: string): string {
  const normalizedHandle = normalizeHandle(handle);
  const aliasHandle = COLLECTION_ROUTE_ALIASES[normalizedHandle];
  if (aliasHandle) {
    return aliasHandle;
  }

  const collection = findCollectionMatch(handle);
  if (!collection) {
    return normalizedHandle;
  }

  return collection.handle;
}

export function resolveCollectionShopifyHandle(handle: string): string {
  const collection = findCollectionMatch(handle);
  if (!collection) {
    return String(handle || "").trim().toLowerCase();
  }

  return collection.shopifyHandle || collection.handle;
}

export function resolveCollectionFeedHandle(collectionHandle: string, subcollectionHandle?: string | null): string {
  const collection = findCollectionMatch(collectionHandle);
  if (!collection) {
    return String(collectionHandle || "").trim().toLowerCase();
  }

  if (subcollectionHandle) {
    const subcollection = findSubcollectionMatch(collection, subcollectionHandle);
    if (subcollection?.shopifyHandle) {
      return subcollection.shopifyHandle;
    }
  }

  return collection.shopifyHandle || collection.handle;
}

export function getCollectionRoutePaths(handle: string): string[] {
  const normalizedHandle = normalizeHandle(handle);
  const aliasHandle = resolveCollectionRouteAlias(handle);
  const collection = findCollectionMatch(handle);
  if (!collection && !aliasHandle) {
    return normalizedHandle ? [`/collections/${normalizedHandle}`] : [];
  }

  return [
    ...new Set(
      [
        normalizedHandle,
        aliasHandle,
        collection?.handle,
        collection?.shopifyHandle,
        ...getCollectionRouteAliasSources(aliasHandle),
      ]
        .map((routeHandle) => normalizeHandle(routeHandle))
        .filter(Boolean)
        .map((routeHandle) => `/collections/${routeHandle}`),
    ),
  ];
}

export function isSiteHeaderCollectionLinkActive(
  pathname: string,
  search: string,
  link: SiteHeaderCollectionLink,
): boolean {
  const routePaths = getCollectionRoutePaths(link.routeHandle);
  if (!routePaths.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return false;
  }

  const currentCollection = normalizeHandle(new URLSearchParams(search).get("collection"));
  if (!currentCollection) {
    return true;
  }

  return link.activeCollectionHandles.some((candidate) => normalizeHandle(candidate) === currentCollection);
}

export function getSubcollectionByHandle(collectionHandle: string, subcollectionHandle: string): SiteSubcollection | null {
  const collection = getCollectionByHandle(collectionHandle);
  if (!collection) {
    return null;
  }

  return findSubcollectionMatch(collection, subcollectionHandle);
}

export function getResourceByHandle(handle: string): SiteResourceGuide | null {
  const normalizedHandle = String(handle || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .split("/", 1)[0];
  return SITE_RESOURCE_GUIDES.find((guide) => guide.handle === normalizedHandle) || null;
}

export function getResourceTopicByHandle(resourceHandle: string, topicHandle: string): SiteResourceTopic | null {
  const guide = getResourceByHandle(resourceHandle);
  if (!guide) {
    return null;
  }

  const normalizedHandle = String(topicHandle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    return null;
  }

  return guide.topics.find((topic) => topic.handle === normalizedHandle) || null;
}

export function isFeaturedCollectionHandle(handle: string): boolean {
  return Boolean(getCollectionByHandle(handle));
}

export function buildCollectionRoute(collectionHandle: string): string {
  return `/collections/${resolveCollectionRouteHandle(collectionHandle)}`;
}

export function buildSubcollectionRoute(collectionHandle: string, subcollectionHandle: string): string {
  const collection = findCollectionMatch(collectionHandle);
  const normalizedSubHandle = String(subcollectionHandle || "").trim().toLowerCase();

  if (!collection) {
    return normalizedSubHandle
      ? `/collections/${String(collectionHandle || "").trim().toLowerCase()}?collection=${encodeURIComponent(normalizedSubHandle)}`
      : buildCollectionRoute(collectionHandle);
  }

  const subcollection = findSubcollectionMatch(collection, subcollectionHandle);
  const feedHandle = subcollection?.shopifyHandle || subcollection?.handle || normalizedSubHandle;
  const collectionRoute = buildCollectionRoute(collection.handle);

  return feedHandle ? `${collectionRoute}?collection=${encodeURIComponent(feedHandle)}` : collectionRoute;
}

export function buildResourceRoute(handle: string): string {
  const normalized = String(handle || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return "/resources";
  }

  const withoutPrefix = normalized.startsWith("resources/") ? normalized.slice("resources/".length) : normalized;
  return withoutPrefix ? `/resources/${withoutPrefix}` : "/resources";
}

export function buildResourceTopicRoute(resourceHandle: string, topicHandle: string): string {
  return buildResourceRoute(`${resourceHandle}/${topicHandle}`);
}

export function buildSearchQueryUrl(query: string): string {
  const normalizedQuery = String(query || "").trim();
  return normalizedQuery ? `/shop?q=${encodeURIComponent(normalizedQuery)}` : "/shop";
}
