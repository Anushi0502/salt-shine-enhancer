import { stripHtml } from "@/lib/formatters";
import type { ShopifyCollection } from "@/types/shopify";

type CollectionLike = Pick<ShopifyCollection, "description" | "handle" | "title">;

export interface HomeCollectionLink {
  label: string;
  handle: string;
  href: string;
}

export interface HomeCollectionCategory extends HomeCollectionLink {
  collectionTitle: string;
  description: string;
  items: HomeCollectionLink[];
}

export interface HomeCollectionHierarchy {
  categories: HomeCollectionCategory[];
  featuredShortcuts: HomeCollectionLink[];
  defaultCategoryHandle: string | null;
}

interface HomeCollectionGroupConfig {
  handle: string;
  label: string;
  childHandles: string[];
}

interface FeaturedShortcutConfig {
  label: string;
  preferredHandles: string[];
}

export const HOME_COLLECTION_GROUPS: HomeCollectionGroupConfig[] = [
  {
    handle: "cookware",
    label: "Kitchen & Dining",
    childHandles: ["cooking-essential", "jaar-opener"],
  },
  {
    handle: "home-decor",
    label: "Home & Decor",
    childHandles: ["candles", "artificial-aquarium-decor-plants"],
  },
  {
    handle: "men-collection",
    label: "Clothing",
    childHandles: ["jeans", "t-shirt", "trousers", "robe"],
  },
  {
    handle: "shoes",
    label: "Shoes & Accessories",
    childHandles: ["hair-accessories"],
  },
  {
    handle: "garden-tools",
    label: "Garden & Tools",
    childHandles: ["tools"],
  },
  {
    handle: "pet-assocerries",
    label: "Pet Supplies",
    childHandles: [],
  },
  {
    handle: "medical-accessories",
    label: "Health, Wellness & Planners",
    childHandles: ["personal-care", "face-mask", "books"],
  },
  {
    handle: "gifts",
    label: "Gifts & Lifestyle",
    childHandles: ["unique-products", "summer-collection", "digital-products"],
  },
  {
    handle: "shopping-bags-jute-bags",
    label: "Travel & Portable Essentials",
    childHandles: ["shopping-bag-market-trolley-bag-with-wheels-collapsible"],
  },
  {
    handle: "winter-wear",
    label: "Deals & Sale",
    childHandles: ["gloves", "under-35"],
  },
];

export const HOME_FEATURED_SHORTCUTS: FeaturedShortcutConfig[] = [
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
    preferredHandles: ["todays-deals", "winter-wear"],
  },
];

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) {
            return part;
          }

          const first = part.slice(0, 1);
          const rest = part.slice(1).toLowerCase();

          if (!/[a-z0-9]/i.test(first)) {
            return `${first}${rest}`;
          }

          return `${first.toUpperCase()}${rest}`;
        })
        .join("-"),
    )
    .join(" ");
}

function formatCollectionLabel(input: unknown): string {
  const raw = stripHtml(input || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return "Collection";
  }

  return toTitleCase(raw.toLowerCase());
}

function buildDescription(label: string, collection: CollectionLike): string {
  const liveDescription = stripHtml(collection.description);
  if (liveDescription) {
    return liveDescription;
  }

  return `Browse the live ${label.toLowerCase()} collection and its current Shopify subcategories.`;
}

function buildLink(handle: string, label: string): HomeCollectionLink {
  return {
    handle,
    label,
    href: `/collections/${handle}`,
  };
}

export function buildHomeCollectionHierarchy(collections: ShopifyCollection[]): HomeCollectionHierarchy {
  const liveCollectionsByHandle = new Map(
    collections.map((collection) => [normalizeHandle(collection.handle), collection] as const),
  );

  const categories = HOME_COLLECTION_GROUPS.flatMap<HomeCollectionCategory>((group) => {
    const liveCollection = liveCollectionsByHandle.get(normalizeHandle(group.handle));
    if (!liveCollection) {
      return [];
    }

    const items = group.childHandles.flatMap<HomeCollectionLink>((handle) => {
      const liveChild = liveCollectionsByHandle.get(normalizeHandle(handle));
      if (!liveChild || normalizeHandle(liveChild.handle) === normalizeHandle(group.handle)) {
        return [];
      }

      return [buildLink(liveChild.handle, formatCollectionLabel(liveChild.title))];
    });

    return [
      {
        ...buildLink(liveCollection.handle, group.label),
        collectionTitle: formatCollectionLabel(liveCollection.title),
        description: buildDescription(group.label, liveCollection),
        items,
      },
    ];
  });

  const featuredShortcuts = HOME_FEATURED_SHORTCUTS.flatMap<HomeCollectionLink>((shortcut) => {
    const handle = shortcut.preferredHandles.find((candidate) => liveCollectionsByHandle.has(normalizeHandle(candidate)));
    if (!handle) {
      return [];
    }

    return [buildLink(handle, shortcut.label)];
  });

  return {
    categories,
    featuredShortcuts,
    defaultCategoryHandle: categories[0]?.handle ?? null,
  };
}
