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
