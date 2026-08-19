import { useQuery } from "@tanstack/react-query";
import { getRuntimeContext, getShopifyStorefrontToken, resolveThemeAsset } from "@/lib/theme-assets";

const NAVIGATION_MENU_HANDLE = String(
  import.meta.env.VITE_SHOPIFY_NAVIGATION_MENU_HANDLE || "sidebar-collections",
)
  .trim()
  .toLowerCase();
const NAVIGATION_DATA_PATH = "/data/sidebar-collections.json";
const STOREFRONT_API_VERSION = String(import.meta.env.VITE_SHOPIFY_STOREFRONT_API_VERSION || "2026-07").trim();
const NAVIGATION_STALE_TIME_MS = 5 * 60 * 1000;
const RESERVED_COLLECTION_HANDLES = new Set(["best-sellers", "appplaza-best-sellers", "new-arrivals"]);

export type ShopifyNavigationItem = {
  id?: string | null;
  title: string;
  url: string;
  type?: string | null;
  resourceId?: string | null;
  items: ShopifyNavigationItem[];
};

export type ShopifyNavigationPayload = {
  generatedAt?: string;
  source?: string;
  handle?: string;
  title?: string;
  items: ShopifyNavigationItem[];
};

export type CollectionNavigationItem = {
  id: string;
  title: string;
  handle: string;
  href: string;
};

export type CollectionNavigationGroup = {
  id: string;
  title: string;
  handle: string | null;
  href: string | null;
  items: CollectionNavigationItem[];
};

type StorefrontMenuResponse = {
  data?: {
    menu?: {
      handle?: string | null;
      title?: string | null;
      items?: unknown;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHandle(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
}

function collectionHandleFromUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw, "https://salt-navigation.invalid");
    const match = url.pathname.match(/\/collections\/([^/?#]+)/i);
    return match?.[1] ? normalizeHandle(decodeURIComponent(match[1])) : "";
  } catch {
    const match = raw.match(/\/collections\/([^/?#]+)/i);
    return match?.[1] ? normalizeHandle(decodeURIComponent(match[1])) : "";
  }
}

function collectionHref(handle: string): string {
  return `/collections/${encodeURIComponent(handle)}`;
}

function subcollectionHref(parentHandle: string, childHandle: string): string {
  return `${collectionHref(parentHandle)}?collection=${encodeURIComponent(childHandle)}`;
}

function normalizeMenuItem(value: unknown): ShopifyNavigationItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = normalizeText(record.title);
  const url = String(record.url || "").trim();
  if (!title) {
    return null;
  }

  const rawItems = Array.isArray(record.items) ? record.items : [];

  return {
    id: record.id ? String(record.id) : null,
    title,
    url,
    type: record.type ? String(record.type) : null,
    resourceId: record.resourceId ? String(record.resourceId) : null,
    items: rawItems.map(normalizeMenuItem).filter((item): item is ShopifyNavigationItem => Boolean(item)),
  };
}

export function normalizeShopifyNavigationPayload(value: unknown): ShopifyNavigationPayload {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];

  return {
    generatedAt: record.generatedAt ? String(record.generatedAt) : undefined,
    source: record.source ? String(record.source) : undefined,
    handle: record.handle ? String(record.handle) : NAVIGATION_MENU_HANDLE,
    title: record.title ? normalizeText(record.title) : undefined,
    items: rawItems.map(normalizeMenuItem).filter((item): item is ShopifyNavigationItem => Boolean(item)),
  };
}

function readInlineNavigation(): ShopifyNavigationPayload | null {
  if (typeof document === "undefined") {
    return null;
  }

  const node = document.getElementById("salt-sidebar-collections");
  if (!node?.textContent?.trim()) {
    return null;
  }

  try {
    const payload = normalizeShopifyNavigationPayload(JSON.parse(node.textContent));
    return payload.items.length ? { ...payload, source: payload.source || "shopify-liquid-menu" } : null;
  } catch {
    return null;
  }
}

async function fetchThemeNavigation(): Promise<ShopifyNavigationPayload> {
  const response = await fetch(resolveThemeAsset(NAVIGATION_DATA_PATH), { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Navigation snapshot request failed (${response.status})`);
  }

  return normalizeShopifyNavigationPayload(await response.json());
}

function storefrontGraphqlEndpoint(): string | null {
  const runtime = getRuntimeContext();
  const candidate =
    runtime.shopBaseUrl ||
    runtime.shopDomain ||
    import.meta.env.VITE_SHOPIFY_STOREFRONT_URL ||
    "";
  if (!candidate) {
    return null;
  }

  try {
    const origin = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`).origin;
    return `${origin}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  } catch {
    return null;
  }
}

async function fetchLiveStorefrontNavigation(): Promise<ShopifyNavigationPayload> {
  const token = getShopifyStorefrontToken();
  const endpoint = storefrontGraphqlEndpoint();
  if (!token || !endpoint) {
    throw new Error("Storefront navigation credentials are unavailable");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({
      query: `query SaltNavigation($handle: String!) {
        menu(handle: $handle) {
          handle
          title
          items {
            id
            title
            url
            type
            resourceId
            items {
              id
              title
              url
              type
              resourceId
              items {
                id
                title
                url
                type
                resourceId
              }
            }
          }
        }
      }`,
      variables: { handle: NAVIGATION_MENU_HANDLE },
    }),
  });

  const payload = (await response.json()) as StorefrontMenuResponse;
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map((error) => normalizeText(error.message)).filter(Boolean).join(" | ") || `Storefront navigation request failed (${response.status})`);
  }

  const menu = payload.data?.menu;
  if (!menu) {
    throw new Error(`Shopify menu '${NAVIGATION_MENU_HANDLE}' was not found`);
  }

  return normalizeShopifyNavigationPayload({
    generatedAt: new Date().toISOString(),
    source: "shopify-storefront-menu",
    handle: menu.handle || NAVIGATION_MENU_HANDLE,
    title: menu.title || "",
    items: menu.items,
  });
}

export async function loadShopifyNavigation(): Promise<ShopifyNavigationPayload> {
  const inline = readInlineNavigation();
  if (inline) {
    return inline;
  }

  try {
    const live = await fetchLiveStorefrontNavigation();
    if (live.items.length) {
      return live;
    }
  } catch {
    // A local Vite run may not have a Storefront token. Continue to the
    // generated snapshot without making the header or sidebar fail.
  }

  try {
    return await fetchThemeNavigation();
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: "empty-navigation",
      handle: NAVIGATION_MENU_HANDLE,
      title: "",
      items: [],
    };
  }
}

export function buildCollectionNavigation(payload: ShopifyNavigationPayload | null | undefined): CollectionNavigationGroup[] {
  const fixedGroups: CollectionNavigationGroup[] = [
    {
      id: "fixed-best-sellers",
      title: "Best Sellers",
      handle: "best-sellers",
      href: collectionHref("best-sellers"),
      items: [],
    },
    {
      id: "fixed-new-arrivals",
      title: "New Arrivals",
      handle: "new-arrivals",
      href: collectionHref("new-arrivals"),
      items: [],
    },
  ];

  const seenGroupHandles = new Set<string>(RESERVED_COLLECTION_HANDLES);
  const groups = (payload?.items || []).flatMap<CollectionNavigationGroup>((item, index) => {
    const parentHandle = collectionHandleFromUrl(item.url);
    const childItems = item.items.flatMap<CollectionNavigationItem>((child, childIndex) => {
      const handle = collectionHandleFromUrl(child.url);
      if (!handle || RESERVED_COLLECTION_HANDLES.has(handle)) {
        return [];
      }

      return [
        {
          id: child.id || `${slugify(item.title)}-${handle}-${childIndex}`,
          title: child.title,
          handle,
          href: parentHandle ? subcollectionHref(parentHandle, handle) : collectionHref(handle),
        },
      ];
    });

    const deduplicatedItems = childItems.filter((child, childIndex, entries) => entries.findIndex((entry) => entry.handle === child.handle) === childIndex);
    if (!parentHandle && !deduplicatedItems.length) {
      return [];
    }

    if (parentHandle && seenGroupHandles.has(parentHandle)) {
      return [];
    }

    if (parentHandle) {
      seenGroupHandles.add(parentHandle);
    }

    return [
      {
        id: item.id || `admin-${slugify(item.title)}-${index}`,
        title: item.title,
        handle: parentHandle || null,
        href: parentHandle ? collectionHref(parentHandle) : deduplicatedItems[0]?.href || null,
        items: deduplicatedItems,
      },
    ];
  });

  return [...fixedGroups, ...groups];
}

export function useShopifyNavigation(enabled = true) {
  return useQuery({
    queryKey: ["shopify-navigation", NAVIGATION_MENU_HANDLE],
    queryFn: loadShopifyNavigation,
    enabled,
    staleTime: NAVIGATION_STALE_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: false,
  });
}
