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
import { seedCollectionsPayload, seedProductsPayload } from "@/lib/seed-data";

const SHOP_BASE = import.meta.env.VITE_SALT_SHOP_URL || "https://saltonlinestore.com";
const DATA_MODE = (import.meta.env.VITE_DATA_MODE || "snapshot") as
  | "live"
  | "snapshot"
  | "seed"
  | "hybrid";
const PAGE_LIMIT = Number(import.meta.env.VITE_SALT_PAGE_LIMIT || 250);
const ABOUT_HANDLE = import.meta.env.VITE_ABOUT_PAGE_HANDLE || "about-us";
const BLOG_HANDLE = import.meta.env.VITE_BLOG_HANDLE || "posts";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
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
    .replace(/\s(?:bis_size|data-mce-fragment|contenteditable)=("[^"]*"|'[^']*')/gi, "")
    .trim();
}

function parseBlogEntriesFromAtom(atomXml: string): BlogPost[] {
  const parsed = new DOMParser().parseFromString(atomXml, "application/xml");
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
      const url = linkNode?.getAttribute("href") || id;
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
        image: firstImageSrcFromHtml(contentHtml),
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
  const payload = await fetchJson<{
    page: {
      id: number;
      handle: string;
      title: string;
      body_html: string;
      published_at: string;
      updated_at: string;
    };
  }>(`${SHOP_BASE}/pages/${ABOUT_HANDLE}.json`);

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
  const response = await fetch(`${SHOP_BASE}/blogs/${BLOG_HANDLE}.atom`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${SHOP_BASE}/blogs/${BLOG_HANDLE}.atom`);
  }

  const atom = await response.text();
  const posts = parseBlogEntriesFromAtom(atom);

  return {
    generatedAt: new Date().toISOString(),
    source: SHOP_BASE,
    blogHandle: BLOG_HANDLE,
    total: posts.length,
    posts,
  };
}

export async function loadProducts(): Promise<ProductsPayload> {
  if (DATA_MODE === "seed") {
    return seedProductsPayload;
  }

  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      const products = await fetchAllProductsFromLive();
      return {
        generatedAt: new Date().toISOString(),
        source: SHOP_BASE,
        total: products.length,
        products,
      };
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<ProductsPayload>("/data/products.json");
    } catch {
      // Fall back to embedded seed catalog when snapshots are unavailable.
    }
  }

  return seedProductsPayload;
}

export async function loadCollections(): Promise<CollectionsPayload> {
  if (DATA_MODE === "seed") {
    return seedCollectionsPayload;
  }

  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      const collections = await fetchAllCollectionsFromLive();
      return {
        generatedAt: new Date().toISOString(),
        source: SHOP_BASE,
        total: collections.length,
        collections,
      };
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<CollectionsPayload>("/data/collections.json");
    } catch {
      // Fall back to embedded seed catalog when snapshots are unavailable.
    }
  }

  return seedCollectionsPayload;
}

export async function loadCollectionProductsMap(): Promise<CollectionProductsPayload> {
  try {
    return await fetchJson<CollectionProductsPayload>("/data/collection-products.json");
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: SHOP_BASE,
      totalCollections: 0,
      collections: {},
    };
  }
}

export async function loadAboutPage(): Promise<AboutPagePayload> {
  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      return await fetchAboutPageFromLive();
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<AboutPagePayload>("/data/about.json");
    } catch {
      // Fall through to fallback payload.
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: SHOP_BASE,
    page: {
      id: 0,
      handle: ABOUT_HANDLE,
      title: "About",
      bodyHtml: "",
      publishedAt: "",
      updatedAt: "",
    },
  };
}

export async function loadBlogPosts(): Promise<BlogPostsPayload> {
  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      return await fetchBlogPostsFromLive();
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<BlogPostsPayload>("/data/blog-posts.json");
    } catch {
      // Fall through to fallback payload.
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: SHOP_BASE,
    blogHandle: BLOG_HANDLE,
    total: 0,
    posts: [],
  };
}

export function useProducts() {
  return useQuery({
    queryKey: ["products", DATA_MODE],
    queryFn: loadProducts,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections", DATA_MODE],
    queryFn: loadCollections,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCollectionProductsMap() {
  return useQuery({
    queryKey: ["collection-products", DATA_MODE],
    queryFn: loadCollectionProductsMap,
    staleTime: 15 * 60 * 1000,
  });
}

export function useAboutPage() {
  return useQuery({
    queryKey: ["about-page", DATA_MODE, ABOUT_HANDLE],
    queryFn: loadAboutPage,
    staleTime: 15 * 60 * 1000,
  });
}

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts", DATA_MODE, BLOG_HANDLE],
    queryFn: loadBlogPosts,
    staleTime: 15 * 60 * 1000,
  });
}
