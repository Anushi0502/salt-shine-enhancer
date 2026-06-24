import { stripHtml } from "@/lib/formatters";
import {
  SITE_HOME_COLLECTION_GROUPS,
  SITE_HOME_FEATURED_SHORTCUTS,
  buildCollectionRoute,
} from "@/lib/site-navigation";
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
    href: buildCollectionRoute(handle),
  };
}

export function buildHomeCollectionHierarchy(collections: ShopifyCollection[]): HomeCollectionHierarchy {
  const liveCollectionsByHandle = new Map(
    collections.map((collection) => [normalizeHandle(collection.handle), collection] as const),
  );

  const categories = SITE_HOME_COLLECTION_GROUPS.flatMap<HomeCollectionCategory>((group) => {
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

  const featuredShortcuts = SITE_HOME_FEATURED_SHORTCUTS.flatMap<HomeCollectionLink>((shortcut) => {
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
