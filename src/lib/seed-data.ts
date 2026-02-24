import collectionCookware from "@/assets/collection-cookware.jpg";
import collectionDecor from "@/assets/collection-decor.jpg";
import collectionApparel from "@/assets/collection-apparel.jpg";
import collectionGifts from "@/assets/collection-gifts.jpg";
import heroMain from "@/assets/hero-main.jpg";
import productDock from "@/assets/product-dock.jpg";
import productPortableStand from "@/assets/product-portable-stand.jpg";
import productTripod from "@/assets/product-tripod.jpg";
import productLaptopStand from "@/assets/product-laptop-stand.jpg";
import type {
  CollectionsPayload,
  ProductsPayload,
  ShopifyCollection,
  ShopifyProduct,
  ShopifyVariant,
} from "@/types/shopify";

const generatedAt = "2026-02-24T00:00:00.000Z";

function variant(
  id: number,
  title: string,
  price: number,
  compareAt: number,
  available = true,
): ShopifyVariant {
  return {
    id,
    title,
    price: price.toFixed(2),
    compare_at_price: compareAt > price ? compareAt.toFixed(2) : null,
    available,
    sku: `SALT-${id}`,
    requires_shipping: true,
  };
}

function product(
  id: number,
  input: {
    title: string;
    handle: string;
    description: string;
    vendor: string;
    productType: string;
    tags: string[];
    image: string;
    variants: ShopifyVariant[];
  },
): ShopifyProduct {
  return {
    id,
    title: input.title,
    handle: input.handle,
    body_html: `<p>${input.description}</p>`,
    vendor: input.vendor,
    product_type: input.productType,
    tags: input.tags.join(", "),
    created_at: generatedAt,
    published_at: generatedAt,
    updated_at: generatedAt,
    variants: input.variants,
    image: {
      id: id * 10,
      src: input.image,
      alt: input.title,
      width: 1600,
      height: 1600,
    },
    images: [
      {
        id: id * 10,
        src: input.image,
        alt: input.title,
        width: 1600,
        height: 1600,
      },
    ],
  };
}

const products: ShopifyProduct[] = [
  product(101, {
    title: "Foldable Laptop Stand Adjustable Portable Notebook Bracket",
    handle: "foldable-laptop-stand-adjustable-portable-notebook-bracket",
    description:
      "A compact aluminum stand with anti-slip feet and elevated airflow channels for cooler all-day sessions.",
    vendor: "SALT",
    productType: "Office Essentials",
    tags: ["new-arrivals", "office", "portable", "best-seller"],
    image: productLaptopStand,
    variants: [
      variant(1011, "Silver", 18.99, 24.99),
      variant(1012, "Space Gray", 20.99, 26.99),
    ],
  }),
  product(102, {
    title: "Portable Foldable Aluminum Alloy Laptop Stand",
    handle: "portable-foldable-aluminum-alloy-laptop-stand",
    description:
      "A travel-friendly desktop riser designed for posture and fast setup at home, office, or hotel desk.",
    vendor: "SALT",
    productType: "Office Essentials",
    tags: ["trending", "office", "portable"],
    image: productPortableStand,
    variants: [
      variant(1021, "Matte Black", 20.99, 29.99),
      variant(1022, "Champagne", 21.99, 30.99),
    ],
  }),
  product(103, {
    title: "Flexible Arm Tripod for Phone and Desktop",
    handle: "flexible-arm-tripod-for-phone-and-desktop",
    description:
      "A bendable tripod that anchors to desks and rails for content creation, meetings, and overhead demos.",
    vendor: "SALT",
    productType: "Electronics Accessories",
    tags: ["new", "creator", "electronics"],
    image: productTripod,
    variants: [variant(1031, "Standard", 28.99, 34.99)],
  }),
  product(104, {
    title: "Vertical Laptop Docking Stand 3 Slot Holder",
    handle: "vertical-laptop-docking-stand-3-slot-holder",
    description:
      "A weighted, anti-scratch organizer that keeps up to three devices upright for a cleaner workspace.",
    vendor: "SALT",
    productType: "Office Essentials",
    tags: ["sale", "desk", "organizer"],
    image: productDock,
    variants: [
      variant(1041, "Walnut", 26.99, 34.99),
      variant(1042, "Natural", 25.99, 33.99),
    ],
  }),
  product(105, {
    title: "Chef Series Nonstick Cookware Starter Set",
    handle: "chef-series-nonstick-cookware-starter-set",
    description:
      "A performance cookware set built for daily cooking, heat consistency, and easy cleanup.",
    vendor: "SALT Home",
    productType: "Cookware",
    tags: ["cookware", "kitchen", "home"],
    image: collectionCookware,
    variants: [variant(1051, "7 Piece Set", 149, 179)],
  }),
  product(106, {
    title: "Signature Decorative Candle Trio",
    handle: "signature-decorative-candle-trio",
    description:
      "Layered fragrance candles in reusable vessels to create a warm ambient living room mood.",
    vendor: "SALT Home",
    productType: "Home Decor",
    tags: ["decor", "gifts", "home"],
    image: collectionDecor,
    variants: [variant(1061, "Vanilla Amber", 42, 56)],
  }),
  product(107, {
    title: "Minimalist Everyday Hoodie",
    handle: "minimalist-everyday-hoodie",
    description:
      "Soft heavyweight fleece with a clean silhouette and premium stitch finish for repeat wear.",
    vendor: "SALT Apparel",
    productType: "Apparel",
    tags: ["apparel", "new-arrivals", "comfort"],
    image: collectionApparel,
    variants: [
      variant(1071, "S", 58, 78),
      variant(1072, "M", 58, 78),
      variant(1073, "L", 58, 78),
    ],
  }),
  product(108, {
    title: "Curated Gift Box Set",
    handle: "curated-gift-box-set",
    description:
      "A ready-to-gift bundle with premium packaging for birthdays, anniversaries, and team celebrations.",
    vendor: "SALT Gifts",
    productType: "Gifts",
    tags: ["gifts", "holiday", "anniversary", "birthday"],
    image: collectionGifts,
    variants: [variant(1081, "Classic Box", 39, 49)],
  }),
  product(109, {
    title: "SALT Premium Lifestyle Bundle",
    handle: "salt-premium-lifestyle-bundle",
    description:
      "A mixed-category bundle blending home, office, and everyday accessories in one launch-ready kit.",
    vendor: "SALT",
    productType: "Lifestyle",
    tags: ["bundle", "featured", "new-arrivals"],
    image: heroMain,
    variants: [variant(1091, "Starter", 119, 149)],
  }),
];

const collections: ShopifyCollection[] = [
  {
    id: 501,
    title: "New Arrivals",
    handle: "new-arrivals",
    description: "Recently launched premium products across the SALT catalog.",
    published_at: generatedAt,
    updated_at: generatedAt,
    image: { id: 5010, src: heroMain, alt: "New arrivals", width: 1600, height: 1000 },
    products_count: 5,
  },
  {
    id: 502,
    title: "Cookware",
    handle: "cookware",
    description: "Everyday kitchen essentials with premium finishing.",
    published_at: generatedAt,
    updated_at: generatedAt,
    image: { id: 5020, src: collectionCookware, alt: "Cookware", width: 1600, height: 1000 },
    products_count: 1,
  },
  {
    id: 503,
    title: "Home Decor",
    handle: "home-decor",
    description: "Decor and accents designed for cozy daily rituals.",
    published_at: generatedAt,
    updated_at: generatedAt,
    image: { id: 5030, src: collectionDecor, alt: "Home decor", width: 1600, height: 1000 },
    products_count: 1,
  },
  {
    id: 504,
    title: "Apparel",
    handle: "apparel",
    description: "Modern wardrobe staples with comfortable cuts.",
    published_at: generatedAt,
    updated_at: generatedAt,
    image: { id: 5040, src: collectionApparel, alt: "Apparel", width: 1600, height: 1000 },
    products_count: 1,
  },
  {
    id: 505,
    title: "Gifts",
    handle: "gifts",
    description: "Giftable picks curated for celebrations and milestones.",
    published_at: generatedAt,
    updated_at: generatedAt,
    image: { id: 5050, src: collectionGifts, alt: "Gifts", width: 1600, height: 1000 },
    products_count: 1,
  },
];

export const seedProductsPayload: ProductsPayload = {
  generatedAt,
  source: "seed",
  total: products.length,
  products,
};

export const seedCollectionsPayload: CollectionsPayload = {
  generatedAt,
  source: "seed",
  total: collections.length,
  collections,
};
