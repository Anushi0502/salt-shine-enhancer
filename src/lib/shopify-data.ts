import { useQuery } from "@tanstack/react-query";
import type {
  AboutPagePayload,
  BlogPost,
  BlogPostsPayload,
  CollectionProductsPayload,
  CollectionsPayload,
  ProductsPayload,
  ShopifyCollection,
  ShopifyProduct,
} from "@/types/shopify";
import { firstImageSrcFromHtml, stripHtml } from "@/lib/formatters";
import { normalizeShopifyAssetUrl, resolveThemeAsset } from "@/lib/theme-assets";

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const SHOP_BASE =
  import.meta.env.VITE_SALT_SHOP_URL ||
  import.meta.env.VITE_SHOPIFY_STOREFRONT_URL ||
  DEFAULT_SHOP_BASE;
const SHOP_BASE_ORIGIN = (() => {
  try {
    const url = new URL(/^https?:\/\//i.test(SHOP_BASE) ? SHOP_BASE : `https://${SHOP_BASE}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SHOP_BASE;
  }
})();
const ENABLE_CROSS_ORIGIN_BLOG_FETCH =
  String(import.meta.env.VITE_ENABLE_CROSS_ORIGIN_BLOG_FETCH || "").trim().toLowerCase() === "true";
const DATA_MODE = "live" as const;
const PAGE_LIMIT = Number(import.meta.env.VITE_SALT_PAGE_LIMIT || 250);
const ABOUT_HANDLE = import.meta.env.VITE_ABOUT_PAGE_HANDLE || "about-us";
const BLOG_HANDLE_INPUT = import.meta.env.VITE_BLOG_HANDLE || "posts";
const BLOG_HANDLES = Array.from(
  new Set(
    BLOG_HANDLE_INPUT
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);
const BLOG_HANDLE = BLOG_HANDLES[0] || "posts";
const LOCAL_SHOPIFY_PROXY_PATH = "/__salt_shopify";
const LIVE_STALE_TIME_MS = 0;
const LIVE_PRODUCTS_REFRESH_MS = 60 * 1000;
const LIVE_CONTENT_REFRESH_MS = 5 * 60 * 1000;
const LIVE_COLLECTION_MAP_REFRESH_MS = 10 * 60 * 1000;

function getLiveBlogBases(): string[] {
  if (typeof window === "undefined") {
    return [SHOP_BASE_ORIGIN];
  }

  const browserOrigin = window.location.origin;
  const hostname = window.location.hostname;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  const bases: string[] = isLocalHost
    ? [`${browserOrigin}${LOCAL_SHOPIFY_PROXY_PATH}`]
    : [browserOrigin];

  if (ENABLE_CROSS_ORIGIN_BLOG_FETCH && browserOrigin !== SHOP_BASE_ORIGIN) {
    bases.push(SHOP_BASE_ORIGIN);
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

async function fetchJson<T>(url: string): Promise<T> {
  const resolvedUrl = resolveThemeAsset(url);
  const response = await fetch(resolvedUrl);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${resolvedUrl}`);
  }

  return (await response.json()) as T;
}

async function fetchAllProductsFromLive(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${SHOP_BASE}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

    allProducts.push(...payload.products);

    if (payload.products.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allProducts;
}

async function fetchAllCollectionsFromLive(): Promise<ShopifyCollection[]> {
  const allCollections: ShopifyCollection[] = [];
  let page = 1;

  while (true) {
    const url = `${SHOP_BASE}/collections.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ collections: ShopifyCollection[] }>(url);

    allCollections.push(...payload.collections);

    if (payload.collections.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allCollections;
}

async function fetchCollectionProductIdsFromLive(handle: string): Promise<number[]> {
  const productIds = new Set<number>();
  let page = 1;

  while (true) {
    const url = `${SHOP_BASE}/collections/${encodeURIComponent(handle)}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

    payload.products.forEach((product) => {
      productIds.add(product.id);
    });

    if (payload.products.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return Array.from(productIds);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const runNext = async (): Promise<void> => {
    const current = index;
    if (current >= items.length) {
      return;
    }

    index += 1;
    results[current] = await worker(items[current]);
    await runNext();
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

function excerptFromHtml(input: string, maxChars = 200): string {
  const text = stripHtml(input);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function normalizeRichHtml(input: string): string {
  return input
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "")
    .replace(/<img([^>]+)>/gi, (_full, attrs: string) => {
      let nextAttrs = attrs
        .replace(/\s(?:srcset|sizes)=("[^"]*"|'[^']*')/gi, "")
        .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "");

      const srcMatch = nextAttrs.match(/\ssrc=(["'])([^"']+)\1/i);
      if (srcMatch) {
        const normalizedSrc = normalizeShopifyAssetUrl(srcMatch[2]) || srcMatch[2];
        nextAttrs = nextAttrs.replace(srcMatch[0], ` src="${normalizedSrc}"`);
      }

      return `<img${nextAttrs}>`;
    })
    .trim();
}

function parseBlogEntriesFromAtom(atomXml: string): BlogPost[] {
  const parsed = new DOMParser().parseFromString(atomXml, "application/xml");
  const parserErrors = parsed.getElementsByTagName("parsererror");
  if (parserErrors.length > 0) {
    throw new Error("Received invalid Atom XML");
  }

  const feedNodes = parsed.getElementsByTagName("feed");
  if (feedNodes.length === 0) {
    throw new Error("Atom feed root not found");
  }

  const entries = Array.from(parsed.getElementsByTagName("entry"));

  return entries
    .map((entry) => {
      const id = entry.getElementsByTagName("id")[0]?.textContent?.trim() || "";
      const publishedAt = entry.getElementsByTagName("published")[0]?.textContent?.trim() || "";
      const updatedAt = entry.getElementsByTagName("updated")[0]?.textContent?.trim() || "";
      const title = entry.getElementsByTagName("title")[0]?.textContent?.trim() || "";
      const author = entry.getElementsByTagName("name")[0]?.textContent?.trim() || "SALT";
      const contentRaw = entry.getElementsByTagName("content")[0]?.textContent || "";
      const contentHtml = normalizeRichHtml(contentRaw);
      const linkNode = Array.from(entry.getElementsByTagName("link")).find(
        (node) => node.getAttribute("rel") === "alternate",
      );
      const url = normalizeShopifyAssetUrl(linkNode?.getAttribute("href") || id) || id;
      const handle = url.split("/").filter(Boolean).at(-1) || "";

      return {
        id,
        handle,
        url,
        title,
        author,
        publishedAt,
        updatedAt,
        excerpt: excerptFromHtml(contentHtml),
        contentHtml,
        image: normalizeShopifyAssetUrl(firstImageSrcFromHtml(contentHtml)),
      } satisfies BlogPost;
    })
    .filter((entry) => Boolean(entry.handle && entry.title && entry.url))
    .sort(
      (a, b) =>
        new Date(b.publishedAt || b.updatedAt || "1970-01-01").getTime() -
        new Date(a.publishedAt || a.updatedAt || "1970-01-01").getTime(),
    );
}

async function fetchAboutPageFromLive(): Promise<AboutPagePayload> {
  const response = await fetch(`${SHOP_BASE}/pages/${ABOUT_HANDLE}.json`);
  if (response.status === 404) {
    throw new Error(`About page handle "${ABOUT_HANDLE}" was not found on Shopify`);
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${SHOP_BASE}/pages/${ABOUT_HANDLE}.json`);
  }

  const payload = (await response.json()) as {
    page: {
      id: number;
      handle: string;
      title: string;
      body_html: string;
      published_at: string;
      updated_at: string;
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    source: SHOP_BASE,
    page: {
      id: payload.page.id,
      handle: payload.page.handle || ABOUT_HANDLE,
      title: payload.page.title || "About",
      bodyHtml: normalizeRichHtml(payload.page.body_html || ""),
      publishedAt: payload.page.published_at || "",
      updatedAt: payload.page.updated_at || "",
    },
  };
}

async function fetchBlogPostsFromLive(): Promise<BlogPostsPayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveBlogBases()) {
    for (const handle of BLOG_HANDLES) {
      const endpoint = `${base}/blogs/${handle}.atom`;
      try {
        const response = await fetch(endpoint, { credentials: "omit" });
        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          endpointErrors.push(`${endpoint} -> ${response.status}`);
          continue;
        }

        const atom = await response.text();
        const posts = parseBlogEntriesFromAtom(atom);

        return {
          generatedAt: new Date().toISOString(),
          source: base,
          blogHandle: handle,
          total: posts.length,
          posts,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        endpointErrors.push(`${endpoint} -> ${message}`);
      }
    }
  }

  if (!BLOG_HANDLES.length) {
    throw new Error("No blog handles configured for live fetch");
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live blog endpoints.";

  throw new Error(`Live blog feed unavailable. ${details}`);
}

export async function loadProducts(): Promise<ProductsPayload> {
  try {
    const products = await fetchAllProductsFromLive();
    return {
      generatedAt: new Date().toISOString(),
      source: SHOP_BASE,
      total: products.length,
      products,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown live products error";
    throw new Error(`Live products fetch failed: ${message}`);
  }
}

export async function loadCollections(): Promise<CollectionsPayload> {
  try {
    const collections = await fetchAllCollectionsFromLive();
    return {
      generatedAt: new Date().toISOString(),
      source: SHOP_BASE,
      total: collections.length,
      collections,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown live collections error";
    throw new Error(`Live collections fetch failed: ${message}`);
  }
}

export async function loadCollectionProductsMap(): Promise<CollectionProductsPayload> {
  try {
    const collections = await fetchAllCollectionsFromLive();
    const mappedEntries = await mapWithConcurrency(collections, 6, async (collection) => {
      const productIds = await fetchCollectionProductIdsFromLive(collection.handle);
      return [
        collection.handle,
        {
          title: collection.title,
          productIds,
        },
      ] as const;
    });

    return {
      generatedAt: new Date().toISOString(),
      source: SHOP_BASE,
      totalCollections: collections.length,
      collections: Object.fromEntries(mappedEntries),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown live collection products map error";
    throw new Error(`Live collection products map fetch failed: ${message}`);
  }
}

export async function loadAboutPage(): Promise<AboutPagePayload> {
  try {
    return await fetchAboutPageFromLive();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown live about page error";
    throw new Error(`Live about page fetch failed: ${message}`);
  }
}

export async function loadBlogPosts(): Promise<BlogPostsPayload> {
  try {
    return await fetchBlogPostsFromLive();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown live blog error";
    throw new Error(`Live blog fetch failed: ${message}`);
  }
}

export function useProducts() {
  return useQuery({
    queryKey: ["products", DATA_MODE],
    queryFn: loadProducts,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_PRODUCTS_REFRESH_MS,
    retry: 1,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections", DATA_MODE],
    queryFn: loadCollections,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_PRODUCTS_REFRESH_MS,
    retry: 1,
  });
}

export function useCollectionProductsMap() {
  return useQuery({
    queryKey: ["collection-products", DATA_MODE],
    queryFn: loadCollectionProductsMap,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_COLLECTION_MAP_REFRESH_MS,
    retry: 1,
  });
}

export function useAboutPage() {
  return useQuery({
    queryKey: ["about-page", DATA_MODE, ABOUT_HANDLE],
    queryFn: loadAboutPage,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_CONTENT_REFRESH_MS,
    retry: 1,
  });
}

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts", DATA_MODE, BLOG_HANDLE],
    queryFn: loadBlogPosts,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_CONTENT_REFRESH_MS,
    retry: false,
  });
}
