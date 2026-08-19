import { useQuery } from "@tanstack/react-query";
import { getRuntimeContext, getShopifyStorefrontToken, resolveThemeAsset } from "@/lib/theme-assets";

const SIDEBAR_NAVIGATION_MENU_HANDLE = String(
  import.meta.env.VITE_SHOPIFY_NAVIGATION_MENU_HANDLE || "sidebar-collections",
)
  .trim()
  .toLowerCase();
const HEADER_NAVIGATION_MENU_HANDLE = String(
  import.meta.env.VITE_SHOPIFY_HEADER_NAVIGATION_MENU_HANDLE || "header-collections",
)
  .trim()
  .toLowerCase();
const SIDEBAR_NAVIGATION_DATA_PATH = "/data/sidebar-collections.json";
const HEADER_NAVIGATION_DATA_PATH = "/data/header-collections.json";
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
  headerItems?: ShopifyNavigationItem[];
  headerGeneratedAt?: string;
  headerSource?: string;
  headerHandle?: string;
  headerTitle?: string;
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

function subcollectionHref(_parentHandle: string, childHandle: string): string {
  // Shopify menu children are real collection links. Keep their canonical
  // collection URL so a child never resolves back to the parent route.
  return collectionHref(childHandle);
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
  const rawHeaderItems = Array.isArray(record.headerItems) ? record.headerItems : [];

  return {
    generatedAt: record.generatedAt ? String(record.generatedAt) : undefined,
    source: record.source ? String(record.source) : undefined,
    handle: record.handle ? String(record.handle) : SIDEBAR_NAVIGATION_MENU_HANDLE,
    title: record.title ? normalizeText(record.title) : undefined,
    items: rawItems.map(normalizeMenuItem).filter((item): item is ShopifyNavigationItem => Boolean(item)),
    headerItems: rawHeaderItems
      .map(normalizeMenuItem)
      .filter((item): item is ShopifyNavigationItem => Boolean(item)),
    headerGeneratedAt: record.headerGeneratedAt ? String(record.headerGeneratedAt) : undefined,
    headerSource: record.headerSource ? String(record.headerSource) : undefined,
    headerHandle: record.headerHandle ? String(record.headerHandle) : undefined,
    headerTitle: record.headerTitle ? normalizeText(record.headerTitle) : undefined,
  };
}

function readInlineNavigation(elementId: string, expectedHandle: string): ShopifyNavigationPayload | null {
  if (typeof document === "undefined") {
    return null;
  }

  const node = document.getElementById(elementId);
  if (!node?.textContent?.trim()) {
    return null;
  }

  try {
    const payload = normalizeShopifyNavigationPayload(JSON.parse(node.textContent));
    return payload.handle === expectedHandle && payload.items.length
      ? { ...payload, source: payload.source || "shopify-liquid-menu" }
      : null;
  } catch {
    return null;
  }
}

async function fetchThemeNavigation(dataPath: string, handle: string): Promise<ShopifyNavigationPayload> {
  const response = await fetch(resolveThemeAsset(dataPath), { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Navigation snapshot request failed (${response.status})`);
  }

  const payload = normalizeShopifyNavigationPayload(await response.json());
  return { ...payload, handle: payload.handle || handle };
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

async function fetchLiveStorefrontNavigation(handle: string): Promise<ShopifyNavigationPayload> {
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
      variables: { handle },
    }),
  });

  const payload = (await response.json()) as StorefrontMenuResponse;
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map((error) => normalizeText(error.message)).filter(Boolean).join(" | ") || `Storefront navigation request failed (${response.status})`);
  }

  const menu = payload.data?.menu;
  if (!menu) {
    throw new Error(`Shopify menu '${handle}' was not found`);
  }

  return normalizeShopifyNavigationPayload({
    generatedAt: new Date().toISOString(),
    source: "shopify-storefront-menu",
    handle: menu.handle || handle,
    title: menu.title || "",
    items: menu.items,
  });
}

async function loadSingleNavigation(
  handle: string,
  inlineElementId: string,
  dataPath: string,
): Promise<ShopifyNavigationPayload> {
  const inline = readInlineNavigation(inlineElementId, handle);
  if (inline) {
    return inline;
  }

  try {
    const live = await fetchLiveStorefrontNavigation(handle);
    if (live.items.length) {
      return live;
    }
  } catch {
    // A local Vite run may not have a Storefront token. Continue to the
    // generated snapshot without making the header or sidebar fail.
  }

  try {
    const snapshot = await fetchThemeNavigation(dataPath, handle);
    if (snapshot.items.length) {
      return snapshot;
    }
  } catch {
    // The generated fallback is optional when the Shopify menu is live.
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "empty-navigation",
    handle,
    title: "",
    items: [],
  };
}

export async function loadShopifyNavigation(): Promise<ShopifyNavigationPayload> {
  const [sidebar, header] = await Promise.all([
    loadSingleNavigation(
      SIDEBAR_NAVIGATION_MENU_HANDLE,
      "salt-sidebar-collections",
      SIDEBAR_NAVIGATION_DATA_PATH,
    ),
    loadSingleNavigation(
      HEADER_NAVIGATION_MENU_HANDLE,
      "salt-header-collections",
      HEADER_NAVIGATION_DATA_PATH,
    ),
  ]);

  return {
    ...sidebar,
    headerItems: header.items,
    headerGeneratedAt: header.generatedAt,
    headerSource: header.source,
    headerHandle: header.handle,
    headerTitle: header.title,
  };
}

export function buildCollectionNavigation(
  payload: ShopifyNavigationPayload | null | undefined,
  menu: "sidebar" | "header" = "sidebar",
): CollectionNavigationGroup[] {
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
  const sourceItems = menu === "header" ? payload?.headerItems || [] : payload?.items || [];
  const groups = sourceItems.flatMap<CollectionNavigationGroup>((item, index) => {
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
    queryKey: ["shopify-navigation", SIDEBAR_NAVIGATION_MENU_HANDLE, HEADER_NAVIGATION_MENU_HANDLE],
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
