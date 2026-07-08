export interface ShopifyImage {
  id: number;
  src: string;
  alt?: string | null;
  width?: number;
  height?: number;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price?: string | null;
  available: boolean;
  sku?: string;
  requires_shipping?: boolean;
}

export interface ShopifyProductReference {
  id: string;
  legacyResourceId?: number | null;
  handle: string;
  title: string;
  productType?: string | null;
  vendor?: string | null;
  image?: string | null;
  referenceType?: string | null;
  fields?: Record<string, unknown>;
}

export interface ShopifyProductMetafieldRecord {
  namespace: string;
  key: string;
  type: string;
  value?: string;
  jsonValue?: unknown;
  reference?: ShopifyProductReference | null;
  references?: ShopifyProductReference[];
}

export interface ShopifyProductCustomData {
  rating?: number | null;
  ratingCount?: number | null;
  relatedProductsDisplay?: string | null;
  relatedProducts?: ShopifyProductReference[];
  complementaryProducts?: ShopifyProductReference[];
  searchProductBoosts?: string[];
  googleCustomProduct?: boolean | null;
  diaperType?: unknown;
  metafields?: Record<string, ShopifyProductMetafieldRecord>;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string | string[];
  created_at: string;
  published_at: string;
  updated_at: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  image?: ShopifyImage | null;
  total_reviews?: number;
  average_rating?: number;
  customData?: ShopifyProductCustomData | null;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  description: string;
  published_at: string;
  updated_at: string;
  image?: ShopifyImage | null;
  products_count: number;
}

export interface ProductsPayload {
  generatedAt: string;
  source: string;
  total: number;
  products: ShopifyProduct[];
}

export interface CollectionsPayload {
  generatedAt: string;
  source: string;
  total: number;
  collections: ShopifyCollection[];
}

export interface CollectionProductsPayload {
  generatedAt: string;
  source: string;
  totalCollections: number;
  collections: Record<
    string,
    {
      title: string;
      productIds: number[];
    }
  >;
}

export interface AboutPagePayload {
  generatedAt: string;
  source: string;
  page: {
    id: number;
    handle: string;
    title: string;
    bodyHtml: string;
    publishedAt: string;
    updatedAt: string;
  };
}

export interface BlogPost {
  id: string;
  handle: string;
  url: string;
  title: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  excerpt: string;
  contentHtml: string;
  image: string | null;
}

export interface BlogPostsPayload {
  generatedAt: string;
  source: string;
  blogHandle: string;
  total: number;
  posts: BlogPost[];
}

export interface ShopifyPolicyPayload {
  generatedAt: string;
  source: string;
  path: string;
  title: string;
  bodyHtml: string;
}
