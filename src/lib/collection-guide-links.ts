export type CollectionGuideLink = {
  handle: string;
  title: string;
};

type CollectionGuideContent = {
  summary: string;
  links: readonly CollectionGuideLink[];
};

// Keep this map intentionally small and explicit. Each target is a published,
// GSC-tested guide whose collection relationship is verified from live data.
const collectionGuideContent: Record<string, CollectionGuideContent> = {
  cookware: {
    summary: "Compare kitchen and cookware essentials by task, from food preparation to everyday dining, using live SALT product details.",
    links: [{ handle: "kitchen-cookware-buying-guide", title: "Kitchen & Cookware Buying Guide" }],
  },
  jeans: {
    summary: "Explore denim-led jeans for casual and everyday styling, then use each live product's options and size details to narrow the choice.",
    links: [{ handle: "jeans-denim-fit-guide", title: "Jeans & Denim Fit Guide" }],
  },
  audio: {
    summary: "Compare complete wireless earbuds with protective cases and audio accessories by product type, compatibility wording, and listed features.",
    links: [
      { handle: "realme-buds-case-compatibility-guide", title: "Realme Buds Case Compatibility Guide" },
      { handle: "salt-earbuds-buying-guide", title: "Earbuds Buying Guide: Cases, Tips & Wireless Earbuds" },
    ],
  },
  "covers-cases": {
    summary: "Start with the device model and listed compatibility wording, then compare protective covers and cases from the current SALT catalog.",
    links: [{ handle: "realme-buds-case-compatibility-guide", title: "Realme Buds Case Compatibility Guide" }],
  },
  "kids-toys-games": {
    summary: "Browse toys, games, and educational play, with a focused route into hands-on assembly activities for kids.",
    links: [
      { handle: "interactive-stem-assembly-activities-for-kids", title: "Interactive STEM Assembly Activities for Kids" },
    ],
  },
  "lunch-boxes": {
    summary: "Compare lunch containers for school, picnic, camping, and travel use by checking the current listing details and options.",
    links: [{ handle: "digital-circus-lunch-box-for-kids", title: "Digital Circus Lunch Box for Kids" }],
  },
  watches: {
    summary: "Compare live watch listings by movement, case wording, water-resistance wording, strap details, and available options.",
    links: [{ handle: "mobwol-watch-guide", title: "Mobwol 40mm Watch Guide" }],
  },
};

export function getCollectionGuideLinks(collectionHandle: string): CollectionGuideLink[] {
  const normalizedCollectionHandle = String(collectionHandle || "").trim().toLowerCase();
  return normalizedCollectionHandle ? [...(collectionGuideContent[normalizedCollectionHandle]?.links || [])] : [];
}

export function getCollectionGuideSummary(collectionHandle: string): string {
  const normalizedCollectionHandle = String(collectionHandle || "").trim().toLowerCase();
  return collectionGuideContent[normalizedCollectionHandle]?.summary || "";
}
