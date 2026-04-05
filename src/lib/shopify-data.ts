import { useQuery } from "@tanstack/react-query";
import type {
  AboutPagePayload,
  BlogPost,
  BlogPostsPayload,
  CollectionProductsPayload,
  CollectionsPayload,
  ProductsPayload,
  ShopifyCollection,
  ShopifyPolicyPayload,
  ShopifyProduct,
} from "@/types/shopify";
import { firstImageSrcFromHtml, stripHtml } from "@/lib/formatters";
import {
  getRuntimeContext,
  getShopBaseOrigin,
  normalizeShopifyAssetUrl,
  resolveThemeAsset,
} from "@/lib/theme-assets";
import { SHOPIFY_POLICY_ARCHIVE, type ShopifyPolicyKey } from "@/lib/shopify-policy-archive";

const runtimeContext = getRuntimeContext();
const SHOP_BASE_ORIGIN = getShopBaseOrigin();
const SHOP_BASE = SHOP_BASE_ORIGIN;
const DATA_MODE = "live" as const;
const PAGE_LIMIT = Number(import.meta.env.VITE_SALT_PAGE_LIMIT || 250);
const ABOUT_HANDLE = runtimeContext.aboutHandle || import.meta.env.VITE_ABOUT_PAGE_HANDLE || "about-us";
const BLOG_HANDLE_INPUT = runtimeContext.blogHandle || import.meta.env.VITE_BLOG_HANDLE || "posts";
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
const BLOG_POSTS_DATA_PATH = "/data/blog-posts.json";
const LIVE_STALE_TIME_MS = 0;
const LIVE_PRODUCTS_REFRESH_MS = 60 * 1000;
const LIVE_CONTENT_REFRESH_MS = 5 * 60 * 1000;
const LIVE_COLLECTION_MAP_REFRESH_MS = 10 * 60 * 1000;
const LIVE_QUERY_MAX_RETRIES = 4;
const LIVE_QUERY_BASE_RETRY_DELAY_MS = 700;
const LIVE_QUERY_MAX_RETRY_DELAY_MS = 9_000;

type CollectionProductIdsPayload = {
  generatedAt: string;
  source: string;
  handle: string;
  total: number;
  productIds: number[];
};

function requireShopBase(): string {
  if (!SHOP_BASE) {
    throw new Error("Shop base URL is unavailable in runtime context");
  }

  return SHOP_BASE;
}

function isLikelyLocalRuntimeHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".lan")
  ) {
    return true;
  }

  if (normalized.startsWith("10.")) {
    return true;
  }

  if (normalized.startsWith("192.168.")) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function getLiveBlogBases(): string[] {
  if (typeof window === "undefined") {
    const shopBase = requireShopBase();
    return [shopBase];
  }

  const browserOrigin = window.location.origin;
  const isLocalHost = isLikelyLocalRuntimeHost(window.location.hostname);
  const bases: string[] = [];
  if (isLocalHost) {
    bases.push(`${browserOrigin}${LOCAL_SHOPIFY_PROXY_PATH}`);
    bases.push(browserOrigin);
  } else {
    bases.push(browserOrigin);
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

function getLiveCatalogBases(): string[] {
  if (typeof window === "undefined") {
    const shopBase = requireShopBase();
    return [shopBase];
  }

  const browserOrigin = window.location.origin;
  const isLocalHost = isLikelyLocalRuntimeHost(window.location.hostname);
  const bases: string[] = [];

  if (isLocalHost) {
    bases.push(`${browserOrigin}${LOCAL_SHOPIFY_PROXY_PATH}`);
    bases.push(browserOrigin);
  } else {
    bases.push(browserOrigin);
  }

  if (SHOP_BASE_ORIGIN && SHOP_BASE_ORIGIN !== browserOrigin) {
    bases.push(SHOP_BASE_ORIGIN);
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

function getLivePolicyBases(): string[] {
  if (typeof window === "undefined") {
    const shopBase = requireShopBase();
    return [shopBase];
  }

  const browserOrigin = window.location.origin;
  const isLocalHost = isLikelyLocalRuntimeHost(window.location.hostname);
  const bases: string[] = [];

  if (isLocalHost) {
    bases.push(`${browserOrigin}${LOCAL_SHOPIFY_PROXY_PATH}`);
    bases.push(browserOrigin);
  } else {
    bases.push(browserOrigin);
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

function normalizePolicyRoute(input: string): string {
  const route = String(input || "").trim().toLowerCase();
  if (!route) {
    return "/";
  }

  return route.startsWith("/") ? route : `/${route}`;
}

function getArchivedPolicyRecord(path: string) {
  const normalizedPath = normalizePolicyRoute(path);
  const keyByPath: Partial<Record<string, ShopifyPolicyKey>> = {
    "/policies/privacy-policy": "privacy",
    "/privacy-policy": "privacy",
    "/policies/refund-policy": "refund",
    "/refund-policy": "refund",
    "/policies/shipping-policy": "shipping",
    "/shipping-policy": "shipping",
    "/policies/contact-information": "contact",
  };

  const key = keyByPath[normalizedPath];
  return key ? SHOPIFY_POLICY_ARCHIVE[key] : null;
}

function buildArchivedPolicyPayload(path: string, fallbackTitle: string): ShopifyPolicyPayload | null {
  const record = getArchivedPolicyRecord(path);
  if (!record?.bodyHtml) {
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: `archive:${record.sourceUrl}`,
    path: normalizePolicyRoute(path),
    title: record.title || fallbackTitle,
    bodyHtml: record.bodyHtml,
  };
}

function extractPolicyContent(rawHtml: string, fallbackTitle: string): { title: string; bodyHtml: string } {
  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");

  const title =
    parsed.querySelector(".shopify-policy__title h1, h1")?.textContent?.trim() ||
    fallbackTitle;

  const bodyNode =
    parsed.querySelector("[data-shopify-policy-body]") ||
    parsed.querySelector(".shopify-policy__body") ||
    parsed.querySelector(".shopify-policy__container .rte") ||
    parsed.querySelector("main .shopify-policy__container") ||
    parsed.querySelector("main .rte") ||
    parsed.querySelector("main article") ||
    parsed.querySelector("main");

  const bodyHtml = normalizeRichHtml(bodyNode?.innerHTML || "");
  return { title, bodyHtml };
}

function shouldRetryLiveQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= LIVE_QUERY_MAX_RETRIES) {
    return false;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  // A missing page/endpoint is not transient and should not hammer retries.
  if (message.includes(" 404") || message.includes("-> 404") || message.includes("(404)")) {
    return false;
  }

  return true;
}

function liveQueryRetryDelay(attemptIndex: number): number {
  const exponentialDelay = LIVE_QUERY_BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptIndex);
  const jitter = Math.floor(Math.random() * 260);
  return Math.min(exponentialDelay + jitter, LIVE_QUERY_MAX_RETRY_DELAY_MS);
}

async function fetchJson<T>(url: string): Promise<T> {
  const resolvedUrl = resolveThemeAsset(url);
  const response = await fetch(resolvedUrl);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${resolvedUrl}`);
  }

  return (await response.json()) as T;
}

async function fetchAllProductsFromLive(base: string): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${base}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

    allProducts.push(...payload.products);

    if (payload.products.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allProducts;
}

async function fetchAllCollectionsFromLive(base: string): Promise<ShopifyCollection[]> {
  const allCollections: ShopifyCollection[] = [];
  let page = 1;

  while (true) {
    const url = `${base}/collections.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ collections: ShopifyCollection[] }>(url);

    allCollections.push(...payload.collections);

    if (payload.collections.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allCollections;
}

async function fetchCollectionProductIdsFromLive(base: string, handle: string): Promise<number[]> {
  const productIds = new Set<number>();
  let page = 1;

  while (true) {
    const url = `${base}/collections/${encodeURIComponent(handle)}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
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
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
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
      const linkImageNode = Array.from(entry.getElementsByTagName("link")).find((node) => {
        const rel = node.getAttribute("rel")?.toLowerCase() || "";
        const type = node.getAttribute("type")?.toLowerCase() || "";
        return rel === "enclosure" || type.startsWith("image/");
      });
      const mediaNodes = [
        ...Array.from(entry.getElementsByTagName("media:content")),
        ...Array.from(entry.getElementsByTagName("media:thumbnail")),
        ...Array.from(entry.getElementsByTagName("thumbnail")),
        ...Array.from(entry.getElementsByTagName("image")),
        ...Array.from(entry.getElementsByTagName("enclosure")),
        ...Array.from(entry.getElementsByTagNameNS("*", "content")).filter((node) => {
          const type = node.getAttribute("type")?.toLowerCase() || "";
          const medium = node.getAttribute("medium")?.toLowerCase() || "";
          return type.startsWith("image/") || medium === "image";
        }),
        ...Array.from(entry.getElementsByTagNameNS("*", "thumbnail")),
        ...Array.from(entry.getElementsByTagNameNS("*", "image")),
      ];
      const atomImage =
        normalizeShopifyAssetUrl(linkImageNode?.getAttribute("href")) ||
        mediaNodes
          .map((node) =>
            normalizeShopifyAssetUrl(
              node.getAttribute("url") || node.getAttribute("href") || node.getAttribute("src"),
            ),
          )
          .find(Boolean) ||
        null;

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
        image: atomImage || normalizeShopifyAssetUrl(firstImageSrcFromHtml(contentHtml)),
      } satisfies BlogPost;
    })
    .filter((entry) => Boolean(entry.handle && entry.title && entry.url))
    .sort(
      (a, b) =>
        new Date(b.publishedAt || b.updatedAt || "1970-01-01").getTime() -
        new Date(a.publishedAt || a.updatedAt || "1970-01-01").getTime(),
    );
}

function normalizeBlogPayload(payload: BlogPostsPayload): BlogPostsPayload {
  const stemBlogToken = (token: string): string => {
    let next = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (next.length < 4) {
      return "";
    }

    for (const suffix of ["ingly", "edly", "ing", "ers", "ies", "ied", "er", "ed", "es", "s"]) {
      if (next.endsWith(suffix) && next.length - suffix.length >= 4) {
        next = next.slice(0, -suffix.length);
        break;
      }
    }

    return next;
  };

  const blogKeywordSet = (input: string): Set<string> =>
    new Set(
      String(input || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(stemBlogToken)
        .filter((token) => token.length >= 4),
    );

  return {
    ...payload,
    total: payload.total || (payload.posts || []).length,
    posts: (() => {
      const normalizedPosts = (payload.posts || []).map((post) => ({
        ...post,
        image:
          normalizeShopifyAssetUrl(post.image) ||
          normalizeShopifyAssetUrl(firstImageSrcFromHtml(post.contentHtml)) ||
          null,
      }));

      const inferRelatedBlogImage = (post: BlogPost): string | null => {
        const targetTokens = blogKeywordSet(`${post.title} ${post.excerpt}`);
        if (!targetTokens.size) {
          return null;
        }

        let bestScore = 0;
        let bestImage: string | null = null;

        for (const candidate of normalizedPosts) {
          if (candidate.id === post.id || !candidate.image) {
            continue;
          }

          const candidateTokens = blogKeywordSet(`${candidate.title} ${candidate.excerpt}`);
          let overlap = 0;

          targetTokens.forEach((token) => {
            if (candidateTokens.has(token)) {
              overlap += 1;
            }
          });

          if (overlap > bestScore) {
            bestScore = overlap;
            bestImage = candidate.image;
          }
        }

        return bestScore >= 2 ? bestImage : null;
      };

      return normalizedPosts.map((post) => ({
        ...post,
        image: post.image || inferRelatedBlogImage(post) || null,
      }));
    })(),
  };
}

async function fetchAboutPageFromLive(): Promise<AboutPagePayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    const endpoint = `${base}/pages/${ABOUT_HANDLE}.json`;
    try {
      const response = await fetch(endpoint);
      if (response.status === 404) {
        endpointErrors.push(`${endpoint} -> 404`);
        continue;
      }

      if (!response.ok) {
        endpointErrors.push(`${endpoint} -> ${response.status}`);
        continue;
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
        source: base,
        page: {
          id: payload.page.id,
          handle: payload.page.handle || ABOUT_HANDLE,
          title: payload.page.title || "About",
          bodyHtml: normalizeRichHtml(payload.page.body_html || ""),
          publishedAt: payload.page.published_at || "",
          updatedAt: payload.page.updated_at || "",
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${endpoint} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live about-page endpoints.";
  throw new Error(`Live about page unavailable for handle "${ABOUT_HANDLE}". ${details}`);
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

        return normalizeBlogPayload({
          generatedAt: new Date().toISOString(),
          source: base as string,
          blogHandle: handle as string,
          total: posts.length,
          posts,
        });
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

async function fetchBlogPostsFromCache(): Promise<BlogPostsPayload> {
  const payload = await fetchJson<BlogPostsPayload>(`${BLOG_POSTS_DATA_PATH}?ts=${Date.now()}`);
  const posts = Array.isArray(payload.posts) ? payload.posts : [];

  if (!posts.length) {
    throw new Error("Cached blog payload is empty");
  }

  return normalizeBlogPayload({
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: payload.source || BLOG_POSTS_DATA_PATH,
    blogHandle: payload.blogHandle || BLOG_HANDLE,
    total: payload.total || posts.length,
    posts,
  });
}

async function fetchPolicyPageFromLive(path: string, fallbackTitle: string): Promise<ShopifyPolicyPayload> {
  const endpointErrors: string[] = [];
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  for (const base of getLivePolicyBases()) {
    const endpoint = `${base}${normalizedPath}`;
    try {
      const response = await fetch(endpoint, { credentials: "omit" });
      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        endpointErrors.push(`${endpoint} -> ${response.status}`);
        continue;
      }

      const html = await response.text();
      const parsed = extractPolicyContent(html, fallbackTitle);

      if (!parsed.bodyHtml) {
        endpointErrors.push(`${endpoint} -> policy body not found`);
        continue;
      }

      return {
        generatedAt: new Date().toISOString(),
        source: base,
        path: normalizedPath,
        title: parsed.title || fallbackTitle,
        bodyHtml: parsed.bodyHtml,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${endpoint} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live policy endpoints.";

  throw new Error(`Live policy fetch failed for ${normalizedPath}. ${details}`);
}

export async function loadProducts(): Promise<ProductsPayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const products = await fetchAllProductsFromLive(base);
      return {
        generatedAt: new Date().toISOString(),
        source: base,
        total: products.length,
        products,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live products endpoints.";
  throw new Error(`Live products fetch failed. ${details}`);
}

export async function loadCollections(): Promise<CollectionsPayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const collections = await fetchAllCollectionsFromLive(base);
      return {
        generatedAt: new Date().toISOString(),
        source: base,
        total: collections.length,
        collections,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live collections endpoints.";
  throw new Error(`Live collections fetch failed. ${details}`);
}

export async function loadCollectionProductsMap(): Promise<CollectionProductsPayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const collections = await fetchAllCollectionsFromLive(base);
      const mappedEntries = await mapWithConcurrency(collections, 6, async (collection) => {
        const productIds = await fetchCollectionProductIdsFromLive(base, collection.handle);
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
        source: base,
        totalCollections: collections.length,
        collections: Object.fromEntries(mappedEntries),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live collection products endpoints.";
  throw new Error(`Live collection products map fetch failed. ${details}`);
}

async function loadCollectionProductIds(handle: string): Promise<CollectionProductIdsPayload> {
  const normalizedHandle = String(handle || "").trim();
  if (!normalizedHandle) {
    throw new Error("Collection handle is required");
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const productIds = await fetchCollectionProductIdsFromLive(base, normalizedHandle);
      return {
        generatedAt: new Date().toISOString(),
        source: base,
        handle: normalizedHandle,
        total: productIds.length,
        productIds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live collection products endpoints.";
  throw new Error(`Live collection products fetch failed for "${normalizedHandle}". ${details}`);
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
    const cached = await fetchBlogPostsFromCache();
    return {
      ...cached,
      source: `cache:${cached.source}`,
    };
  } catch (cacheError) {
    const cacheMessage =
      cacheError instanceof Error ? cacheError.message : "Unknown cached blog error";

    try {
      return await fetchBlogPostsFromLive();
    } catch (liveError) {
      const liveMessage = liveError instanceof Error ? liveError.message : "Unknown live blog error";
      throw new Error(`Cached blog fallback failed: ${cacheMessage}. Live blog fetch failed: ${liveMessage}`);
    }
  }
}

export async function loadPolicyPage(path: string, fallbackTitle: string): Promise<ShopifyPolicyPayload> {
  try {
    return await fetchPolicyPageFromLive(path, fallbackTitle);
  } catch (error) {
    const archived = buildArchivedPolicyPayload(path, fallbackTitle);
    if (archived) {
      return archived;
    }

    const message = error instanceof Error ? error.message : "Unknown live policy error";
    throw new Error(message);
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
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
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
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
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
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useCollectionProductIds(handle: string, enabled = true) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();

  return useQuery({
    queryKey: ["collection-products-by-handle", DATA_MODE, normalizedHandle],
    queryFn: () => loadCollectionProductIds(normalizedHandle),
    enabled: enabled && Boolean(normalizedHandle),
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_COLLECTION_MAP_REFRESH_MS,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
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
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts", DATA_MODE, BLOG_HANDLE],
    queryFn: loadBlogPosts,
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: LIVE_CONTENT_REFRESH_MS,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function usePolicyPage(path: string, fallbackTitle: string) {
  return useQuery({
    queryKey: ["policy-page", DATA_MODE, path],
    queryFn: () => loadPolicyPage(path, fallbackTitle),
    staleTime: LIVE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: LIVE_CONTENT_REFRESH_MS,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}
