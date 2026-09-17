export const SALT_BRAND_DESCRIPTION =
  "SALT is a curated online store for practical, giftable finds across home, kitchen, travel, pet care, wellness, style, and everyday essentials.";

export const SALT_BRAND_SHORT_DESCRIPTION =
  "Curated practical and giftable everyday finds for easier routines and more thoughtful shopping.";

export const SALT_BRAND_CATEGORY_LABELS = [
  "Home",
  "Kitchen",
  "Travel",
  "Pet care",
  "Wellness",
  "Style",
  "Everyday essentials",
] as const;

export const SALT_FINDS_WEEK_01 = {
  slug: "practical-gifts-for-someone-who-has-everything",
  title: "SALT Finds: Practical Gifts for Someone Who Has Everything",
  summary:
    "A criteria-led way to choose a useful gift: start with a real routine, compare ease of use, and confirm the live product details before ordering.",
  route:
    "/pages/resources?resource=guide&handle=gift-guides%2Fpractical-gifts-for-someone-who-has-everything",
  collectionRoute: "/collections/gifts",
  featuredProducts: [
    "the-living-legacy-planner",
    "laopao-10w-wireless-charging-led-desk-lamp-dimmable-with-night-light",
    "digital-wall-clock-time-day-and-temperature-display",
  ],
  campaign: "salt-finds-practical-gifts",
} as const;
