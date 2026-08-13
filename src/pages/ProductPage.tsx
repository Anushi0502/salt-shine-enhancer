import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  History,
  Heart,
  Minus,
  PackageCheck,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { buildShopifyCartUrl, buildShopifyDirectCheckoutUrl, useCart } from "@/lib/cart";
import {
  compareAt,
  formatMoney,
  isPlausibleComparePrice,
  minPrice,
  productBenefitText,
  productImage,
  productTagList,
  sanitizeRichHtml,
  sortVariantsByPrice,
  stripHtml,
} from "@/lib/formatters";
import { isNativeApp } from "@/lib/mobile";
import { openExternalUrl } from "@/lib/mobile";
import { useJudgeMeRatings } from "@/lib/judgeme";
import { rememberRecentlyViewedHandle } from "@/lib/recently-viewed";
import {
  getStoreCurrencyCode,
  scheduleMetaPixelTask,
  trackMetaPixelInitiateCheckout,
  trackMetaPixelViewContent,
} from "@/lib/meta-pixel";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import {
  getProductPurchasesLast30Days,
  recordDeviceOrderHistory,
  useDeviceOrderHistory,
} from "@/lib/order-history";
import {
  useCollectionProductsMap,
  useProductByHandle,
  useProductSearchIndex,
} from "@/lib/shopify-data";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";
import {
  buildBreadcrumbStructuredData,
  buildProductCollectionIndex,
  buildProductStructuredData,
  pickComplementaryProducts,
  pickRelatedProducts,
} from "@/lib/sales-optimization";
import type { ShopifyProduct, ShopifyProductReference } from "@/types/shopify";

// Keep the deployed PDP chunk independently versioned so Shopify's CDN never
// reuses a pre-runtime-fix module after a theme upload.
const PRODUCT_PAGE_RUNTIME_VERSION = "2026-08-11.1";
const ShopifyProductReviews = lazy(() => import("@/components/storefront/ShopifyProductReviews"));

function displayVariantTitle(title?: string): string {
  const normalized = (title || "").trim();
  if (!normalized || normalized.toLowerCase() === "default title") {
    return "Standard Option";
  }

  return normalized;
}

function variantOptionParts(title?: string): string[] {
  return displayVariantTitle(title)
    .split(/\s*\/\s*|\s-\s/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function optionGroupLabel(index: number, groupCount: number): string {
  if (groupCount === 2) {
    return index === 0 ? "Color" : "Size";
  }

  return groupCount === 1 ? "Option" : `Option ${index + 1}`;
}

function isVariantAvailable(variant?: ShopifyProduct["variants"][number] | null): boolean {
  return variant?.available !== false;
}

function productVariantImage(product: ShopifyProduct, variant?: ShopifyProduct["variants"][number] | null): string | null {
  if (!variant) {
    return productImage(product);
  }

  const productImages = Array.isArray(product.images) ? product.images : [];
  const linkedImage = productImages.find((image) => image.variant_ids?.includes(variant.id));
  return normalizeShopifyAssetUrl(variant.featured_image?.src || linkedImage?.src) || productImage(product);
}

function productImageAtWidth(source: string | null | undefined, width: number): string {
  const normalized = normalizeShopifyAssetUrl(source) || "";
  if (!normalized) {
    return normalized;
  }

  try {
    const url = new URL(normalized);
    const isShopifyImage = /cdn\.shopify\.com$/i.test(url.hostname) || url.pathname.startsWith("/cdn/shop/");
    if (!isShopifyImage) {
      return normalized;
    }

    url.searchParams.set("width", String(width));
    return url.toString();
  } catch {
    return normalized;
  }
}

function productImageSrcSet(source: string | null | undefined): string | undefined {
  const normalized = normalizeShopifyAssetUrl(source) || "";
  if (!normalized || !/cdn\.shopify\.com/i.test(normalized)) {
    return undefined;
  }

  return [640, 960, 1280]
    .map((width) => `${productImageAtWidth(normalized, width)} ${width}w`)
    .join(", ");
}

type ProductSpecPair = {
  label: string;
  value: string;
};

type ProductReviewSummary = {
  rating: number;
  reviewCount: number;
  purchasedLastMonth: number;
};

function extractNumericId(input?: string | number | null): string {
  const text = String(input ?? "").trim();
  if (!text) {
    return "";
  }

  const match = text.match(/\d+/);
  return match?.[0] || text;
}

function referenceMatchesProduct(reference: ShopifyProductReference | null | undefined, product: ShopifyProduct): boolean {
  if (!reference) {
    return false;
  }

  const referenceId = extractNumericId(reference.legacyResourceId ?? reference.id);
  if (referenceId && referenceId === String(product.id)) {
    return true;
  }

  const referenceHandle = String(reference.handle || "").trim().toLowerCase();
  return referenceHandle ? referenceHandle === String(product.handle || "").trim().toLowerCase() : false;
}

function resolveProductReferences(
  references: ShopifyProductReference[] | null | undefined,
  products: ShopifyProduct[],
): ShopifyProduct[] {
  if (!Array.isArray(references) || !references.length) {
    return [];
  }

  const seen = new Set<number>();
  const resolved: ShopifyProduct[] = [];

  for (const reference of references) {
    const match = products.find((product) => referenceMatchesProduct(reference, product));
    if (!match || seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    resolved.push(match);
  }

  return resolved;
}

function dedupeProducts(products: ShopifyProduct[]): ShopifyProduct[] {
  const seen = new Set<number>();
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }

    seen.add(product.id);
    return true;
  });
}

function buildReviewSummaryFallback(product: ShopifyProduct | null | undefined): ProductReviewSummary | null {
  const rating = Number(product?.average_rating || 0);
  const reviewCount = Number(product?.total_reviews || 0);

  if (rating <= 0 && reviewCount <= 0) {
    return null;
  }

  return {
    rating,
    reviewCount,
    purchasedLastMonth: 0,
  };
}

function normalizeProductBodyText(input: string | null | undefined): string {
  const raw = typeof input === "string" ? input : "";

  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n");
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.findIndex((entry) => entry === value) === index);
}

function stripContentLabel(input: string | null | undefined): string {
  return (input || "").replace(/^(description|specifications?|details?|features?|notes?)\s*[:-]?\s*/i, "").trim();
}

function extractProductBullets(bodyHtml: string, fallback: string): string[] {
  const bodyText = normalizeProductBodyText(bodyHtml);
  const sentences = stripHtml(bodyHtml)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = uniqueStrings(
    [
      ...bodyText
        .split(/\n+/)
        .map((line) => stripContentLabel(line.replace(/^[-•\u2022]+\s*/, "").trim()))
        .filter(Boolean),
      ...sentences.map((sentence) => stripContentLabel(sentence)),
    ]
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 36 && line.length <= 170)
      .filter(
        (line) =>
          !/^(description|specifications?|details|notes?|features?)$/i.test(line) &&
          !/^https?:\/\//i.test(line),
      ),
  );

  if (candidates.length > 0) {
    return candidates.slice(0, 3);
  }

  if (fallback) {
    return [stripContentLabel(fallback)];
  }

  return [];
}

function extractProductSpecs(bodyHtml: string, productType: string, variantCount: number): ProductSpecPair[] {
  const lines = normalizeProductBodyText(bodyHtml)
    .split(/\n+/)
    .map((line) => stripContentLabel(line.replace(/\s+/g, " ").trim()))
    .filter(Boolean);

  const specs: ProductSpecPair[] = [];
  const seen = new Set<string>();

  const addSpec = (label: string, value: string) => {
    const normalizedLabel = label.replace(/\s+/g, " ").trim();
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    if (!normalizedLabel || !normalizedValue) {
      return;
    }

    const key = `${normalizedLabel.toLowerCase()}:${normalizedValue.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    specs.push({ label: normalizedLabel, value: normalizedValue });
  };

  for (const line of lines) {
    if (specs.length >= 4) {
      break;
    }

    const match = line.match(/^([A-Za-z][A-Za-z\s/&()-]{1,45})\s*:\s*(.+)$/);
    if (!match) {
      continue;
    }

    const label = match[1].trim();
    const value = match[2].trim();
    if (/^(description|specifications?|details|notes?|features?)$/i.test(label) || value.length < 2) {
      continue;
    }

    addSpec(label, value);
  }

  if (!specs.length && productType) {
    addSpec("Category", productType);
  }

  if (specs.length < 4) {
    addSpec("Options", `${variantCount} ${variantCount === 1 ? "option" : "options"}`);
  }

  if (specs.length < 4) {
    addSpec("Format", "Live Shopify detail");
  }

  return specs.slice(0, 4);
}

const ProductPage = () => {
  const { handle } = useParams();
  const { addItem } = useCart();
  const { isWishlisted, toggleItem } = useWishlist();
  // Shopify's Liquid product prefetch or the in-flight route warmup is the
  // first-paint source. The direct Shopify product endpoint immediately
  // revalidates it; a stale catalog record is never painted as the PDP truth.
  const { data: productData, isLoading, error, refetch } = useProductByHandle(handle, true, true);
  const secondaryContentAnchorRef = useRef<HTMLDivElement | null>(null);
  const [secondaryContentProductId, setSecondaryContentProductId] = useState<number | null>(null);
  const product = useMemo(() => productData, [productData]);
  const loadSecondaryContent = Boolean(product?.id && secondaryContentProductId === product.id);
  const shouldLoadMerchandisingData = Boolean(product && loadSecondaryContent);
  const { data: collectionProductsMapPayload } = useCollectionProductsMap(shouldLoadMerchandisingData);
  const { data: productSearchPayload } = useProductSearchIndex(shouldLoadMerchandisingData);
  const products = useMemo(() => productSearchPayload?.products ?? [], [productSearchPayload]);
  const { entries: deviceOrderEntries } = useDeviceOrderHistory();
  const nativeApp = isNativeApp();
  const primaryProductImage = product ? productImage(product) || "" : "";
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const collectionIndex = useMemo(
    () => buildProductCollectionIndex(collectionProductsMapPayload),
    [collectionProductsMapPayload],
  );

  useEffect(() => {
    const node = secondaryContentAnchorRef.current;
    const productId = Number(product?.id || 0);
    setSecondaryContentProductId(null);

    if (!node || !productId || typeof IntersectionObserver === "undefined") {
      if (productId) {
        setSecondaryContentProductId(productId);
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setSecondaryContentProductId(productId);
        observer.disconnect();
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [handle, product?.id]);

  const variants = useMemo(() => (product ? sortVariantsByPrice(product.variants) : []), [product]);
  const initialVariant = useMemo(
    () => variants.find((variant) => isVariantAvailable(variant)) || variants[0],
    [variants],
  );
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [recentHandles, setRecentHandles] = useState<string[]>([]);
  const [showAvailableOnly] = useState(true);
  const productMetafieldReviewSummary = useMemo(() => buildReviewSummaryFallback(product), [product]);
  const currentRatingsQuery = useJudgeMeRatings(product ? [product.id] : []);
  const reviewSummary = product
    ? currentRatingsQuery.data?.[product.id] || productMetafieldReviewSummary
    : productMetafieldReviewSummary;
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || variants[0],
    [selectedVariantId, variants],
  );
  const quantityFloor = useMemo(
    () =>
      getMinimumProductQuantity(
        product?.handle,
        Number(selectedVariant?.price || 0),
        product?.customData?.shopChannelMinimumQuantity,
      ),
    [product?.customData?.shopChannelMinimumQuantity, product?.handle, selectedVariant?.price],
  );

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // The Shopify Pumper app renders outside the React root. Tell the theme's
    // critical gate to keep it hidden until the first product image is ready.
    window.dispatchEvent(new Event("salt:product-media-loading"));

    return () => {
      window.dispatchEvent(new Event("salt:product-media-ready"));
    };
  }, [handle]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) {
      return;
    }

    // Do not leave the external widget hidden for error, not-found, or
    // intentionally image-less products.
    if (error || !product || !primaryProductImage || heroImageRef.current?.complete) {
      window.dispatchEvent(new Event("salt:product-media-ready"));
    }
  }, [activeImage, error, isLoading, primaryProductImage, product]);

  useEffect(() => {
    if (!product) {
      return;
    }

    setSelectedVariantId(initialVariant?.id || 0);
    setQuantity(
      getMinimumProductQuantity(
        product.handle,
        Number(initialVariant?.price || 0),
        product.customData?.shopChannelMinimumQuantity,
      ),
    );
    setActiveImage(productVariantImage(product, initialVariant) || "");
  }, [initialVariant, product]);

  useEffect(() => {
    if (!product || !selectedVariant) {
      return;
    }

    setActiveImage(productVariantImage(product, selectedVariant) || "");
  }, [product, selectedVariant]);

  useEffect(() => {
    if (!showAvailableOnly || !selectedVariantId) {
      return;
    }

    const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
    if (isVariantAvailable(selectedVariant)) {
      return;
    }

    const firstAvailable = variants.find((variant) => isVariantAvailable(variant));
    if (firstAvailable) {
      setSelectedVariantId(firstAvailable.id);
    }
  }, [showAvailableOnly, selectedVariantId, variants]);

  useEffect(() => {
    if (!product || typeof window === "undefined") {
      return;
    }

    setRecentHandles(rememberRecentlyViewedHandle(product.handle));
  }, [product]);

  useEffect(() => {
    if (!product) {
      return;
    }

    return scheduleMetaPixelTask(() => trackMetaPixelViewContent(product, selectedVariant));
  }, [product, selectedVariant]);

  useEffect(() => {
    if (!product || !selectedVariant || typeof window === "undefined") {
      return;
    }

    const selectedPrice = Number(selectedVariant.price || 0);
    const selectedComparePriceCandidate = Number(selectedVariant.compare_at_price || 0) || compareAt(product);
    const selectedComparePrice = isPlausibleComparePrice(selectedPrice, selectedComparePriceCandidate)
      ? selectedComparePriceCandidate
      : 0;

    window.dispatchEvent(
      new CustomEvent("salt:product-variant-change", {
        detail: {
          handle: product.handle,
          variantId: selectedVariant.id,
          price: selectedPrice,
          compareAtPrice: selectedComparePrice > 0 ? selectedComparePrice : null,
          title: selectedVariant.title,
        },
      }),
    );
  }, [product, selectedVariant]);

  const manualRelatedProducts = useMemo(
    () => resolveProductReferences(product?.customData?.relatedProducts, products).filter((entry) => entry.id !== product?.id),
    [product?.customData?.relatedProducts, product?.id, products],
  );
  const manualComplementaryProducts = useMemo(
    () => resolveProductReferences(product?.customData?.complementaryProducts, products).filter((entry) => entry.id !== product?.id),
    [product?.customData?.complementaryProducts, product?.id, products],
  );
  const automaticRelatedProducts = useMemo(
    () =>
      product
        ? pickRelatedProducts(product, products, {
            collectionIndex,
            limit: 5,
            excludedIds: new Set<number>([...manualRelatedProducts.map((entry) => entry.id), product.id]),
          })
        : [],
    [collectionIndex, manualRelatedProducts, product, products],
  );
  const relatedProducts = useMemo(() => {
    if (!product) {
      return [];
    }

    const displayMode = String(product.customData?.relatedProductsDisplay || "").trim().toLowerCase();
    if (displayMode === "only manual") {
      return manualRelatedProducts.slice(0, 5);
    }

    const combined =
      displayMode === "ahead"
        ? [...manualRelatedProducts, ...automaticRelatedProducts]
        : manualRelatedProducts.length
          ? [...manualRelatedProducts, ...automaticRelatedProducts]
          : automaticRelatedProducts;

    return dedupeProducts(combined).slice(0, 5);
  }, [automaticRelatedProducts, manualRelatedProducts, product]);
  const automaticComplementaryProducts = useMemo(
    () =>
      product
        ? pickComplementaryProducts(product, products, {
            collectionIndex,
            limit: 5,
            excludedIds: new Set<number>([
              product.id,
              ...relatedProducts.map((entry) => entry.id),
              ...manualComplementaryProducts.map((entry) => entry.id),
            ]),
          })
        : [],
    [collectionIndex, manualComplementaryProducts, product, products, relatedProducts],
  );
  const complementaryProducts = useMemo(
    () =>
      dedupeProducts(
        [...manualComplementaryProducts, ...automaticComplementaryProducts].filter(
          (entry) => entry.id !== product?.id && !relatedProducts.some((related) => related.id === entry.id),
        ),
      ).slice(0, 5),
    [automaticComplementaryProducts, manualComplementaryProducts, product?.id, relatedProducts],
  );
  const recentlyViewedProducts = useMemo(
    () =>
      product
        ? recentHandles
            .filter((entry) => entry !== product.handle)
            .map((entry) => products.find((candidate) => candidate.handle === entry))
            .filter((entry): entry is (typeof products)[number] => Boolean(entry))
            .slice(0, 5)
        : [],
    [product, products, recentHandles],
  );
  const relatedCardRatingIds = useMemo(
    () => Array.from(new Set([...relatedProducts, ...complementaryProducts, ...recentlyViewedProducts].map((entry) => entry.id))),
    [complementaryProducts, recentlyViewedProducts, relatedProducts],
  );
  const relatedCardRatingsQuery = useJudgeMeRatings(relatedCardRatingIds);
  const relatedCardRatingsById = relatedCardRatingsQuery.data || {};
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const seoStructuredData = useMemo(() => {
    if (!origin || !product) {
      return [];
    }

    return [
      buildBreadcrumbStructuredData([
        { name: "Home", url: `${origin}/` },
        { name: "Shop", url: `${origin}/shop` },
        { name: product.title, url: `${origin}/products/${product.handle}` },
      ]),
      buildProductStructuredData(product, origin, reviewSummary, getStoreCurrencyCode()),
    ].filter(Boolean);
  }, [origin, product, reviewSummary]);

  // Keep the blocking state limited to the short live Shopify detail request;
  // the page never substitutes an older catalog record for the canonical PDP.
  if (isLoading && !product) {
    return <LoadingState title="Loading product" subtitle="Preparing details, variants, and delivery info." />;
  }

  if (error && !product) {
    return (
      <ErrorState
        title="We could not load this product"
        subtitle="Please retry or return to the catalog."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              Retry
            </button>
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-bold"
            >
              Back to shop
            </Link>
          </div>
        }
      />
    );
  }

  if (!product) {
    return (
      <ErrorState
        title="Product not found"
        subtitle="The requested product handle is unavailable in the current catalog."
        action={
          <Link
            to="/shop"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Browse products
          </Link>
        }
      />
    );
  }
  const variantOptionGroupCount = Math.max(1, ...variants.map((variant) => variantOptionParts(variant.title).length));
  const selectedVariantParts = variantOptionParts(selectedVariant?.title);
  const variantOptionGroups = Array.from({ length: variantOptionGroupCount }, (_, groupIndex) => {
    const values = Array.from(
      new Set(
        variants
          .map((variant) => variantOptionParts(variant.title)[groupIndex])
          .filter(Boolean),
      ),
    );

    return {
      label: optionGroupLabel(groupIndex, variantOptionGroupCount),
      values,
    };
  });
  const price = Number(selectedVariant?.price || 0);
  const availableVariantsCount = variants.filter((variant) => isVariantAvailable(variant)).length;
  const comparePriceCandidate = Number(selectedVariant?.compare_at_price || 0) || compareAt(product);
  const comparePrice = isPlausibleComparePrice(price, comparePriceCandidate) ? comparePriceCandidate : 0;
  const isAvailable = isVariantAvailable(selectedVariant);
  const savingsAmount = comparePrice > price ? comparePrice - price : 0;
  const discountPercent = comparePrice > price ? Math.round(((comparePrice - price) / comparePrice) * 100) : 0;

  const selectedQuantity = Math.max(quantityFloor, Math.floor(quantity || 1));
  const directCheckoutUrl = selectedVariant
    ? buildShopifyDirectCheckoutUrl(selectedVariant.id, selectedQuantity)
    : buildShopifyCartUrl();
  const checkoutHandoffUrl = directCheckoutUrl;
  const checkoutTargetUrl = checkoutHandoffUrl;
  const devicePurchasesLast30Days = getProductPurchasesLast30Days(
    deviceOrderEntries,
    product.handle,
  );
  const purchasedLastMonth = Math.max(
    devicePurchasesLast30Days,
    reviewSummary?.purchasedLastMonth || 0,
  );
  const reviewConfidenceScore = reviewSummary
    ? Math.min(
        99,
        Math.round(
          (Math.max(0, Math.min(reviewSummary.rating, 5)) / 5) * 70 +
            (Math.min(reviewSummary.reviewCount, 250) / 250) * 30,
        ),
      )
    : 0;
  const reviewConfidenceLabel = reviewConfidenceScore >= 90
    ? "Very high trust signal"
    : reviewConfidenceScore >= 75
      ? "Strong trust signal"
      : reviewConfidenceScore > 0
        ? "Emerging trust signal"
        : "";

  const primaryImage = primaryProductImage;
  const displayedImage = activeImage || primaryImage;
  const productImages = Array.isArray(product.images) ? product.images : [];
  const imageSources = (productImages.length
    ? productImages.map((image) => image.src)
    : [primaryImage]).filter(Boolean);
  // Product type/subtitle metadata is intentionally omitted from the visual
  // product header so collection labels cannot be mistaken for product names.
  const subtitle = "";
  const badgeText = product.customData?.badgeText?.trim() || "";
  const customHighlights = (product.customData?.highlights || []).map((entry) => entry.trim()).filter(Boolean);
  const productSummary = productBenefitText(product, 170);
  const detailBullets = extractProductBullets(product.body_html, productSummary);
  const productSpecs = extractProductSpecs(product.body_html, product.product_type || "", variants.length);
  const wishlisted = isWishlisted(product.handle);
  const brandLabel = product.vendor?.trim() || "SALT";
  const heroThumbnailSources = imageSources.slice(0, 8);
  const activeImageIndex = Math.max(0, imageSources.indexOf(displayedImage));
  const reviewBadgeLabel = reviewSummary && reviewSummary.reviewCount > 0
    ? `${reviewSummary.rating.toFixed(1)} · ${reviewSummary.reviewCount.toLocaleString()} reviews`
    : "";

  const toggleWishlistState = () => {
    const nextSaved = !wishlisted;
    toggleItem(wishlistItemFromProduct(product));
    toast.success(nextSaved ? "Saved to wishlist" : "Removed from wishlist", {
      description: product.title,
    });
  };

  const handleBuyNowClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    if (!selectedVariant || !isAvailable) {
      return;
    }

    trackMetaP
    ixelInitiateCheckout([
      {
        id: selectedVariant.id,
        shopifyVariantId: selectedVariant.id,
        handle: product.handle,
        title: `${product.title} (${selectedVariant.title})`,
        unitPrice: price,
        quantity: selectedQuantity,
        productType: product.product_type,
      },
    ]);

    recordDeviceOrderHistory({
      source: "buy-now",
      checkoutUrl: checkoutHandoffUrl,
      items: [
        {
          id: selectedVariant.id,
          shopifyVariantId: selectedVariant.id,
          handle: product.handle,
          title: `${product.title} (${selectedVariant.title})`,
          image: activeImage || primaryImage,
          unitPrice: price,
          quantity: selectedQuantity,
          productType: product.product_type,
        },
      ],
    });

    void openExternalUrl(checkoutTargetUrl);
  };

  const addToCart = () => {
    if (!selectedVariant || !isAvailable) {
      return;
    }

    addItem(
      {
        id: selectedVariant.id,
        shopifyVariantId: selectedVariant.id,
        handle: product.handle,
        title: `${product.title} (${selectedVariant.title})`,
        image: activeImage || primaryImage,
        unitPrice: price,
        productType: product.product_type,
        minimumQuantity: product.customData?.shopChannelMinimumQuantity || quantityFloor,
      },
      selectedQuantity,
    );

    toast.success("Added to cart", {
      description: `${selectedQuantity} x ${product.title}`,
    });
  };

  const selectVariantOption = (groupIndex: number, value: string) => {
    const matchingVariant = variants.find((variant) => {
      const parts = variantOptionParts(variant.title);
      return (
        parts[groupIndex] === value &&
        parts.every((part, index) => index === groupIndex || !selectedVariantParts[index] || part === selectedVariantParts[index]) &&
        isVariantAvailable(variant)
      );
    }) || variants.find((variant) => variantOptionParts(variant.title)[groupIndex] === value && isVariantAvailable(variant));

    if (matchingVariant) {
      setSelectedVariantId(matchingVariant.id);
    }
  };

  const moveGallery = (offset: number) => {
    if (imageSources.length < 2) {
      return;
    }

    const nextIndex = (activeImageIndex + offset + imageSources.length) % imageSources.length;
    setActiveImage(imageSources[nextIndex] || "");
  };

  const shareProduct = async () => {
    const shareData = { title: product.title, url: window.location.href };

    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href);
    toast.success("Product link copied");
  };

  return (
    <section
      data-salt-product-runtime={PRODUCT_PAGE_RUNTIME_VERSION}
      className="mx-auto mt-4 w-[min(1280px,calc(100%_-_20px))] pb-20 sm:mt-5 sm:w-[min(1280px,calc(100%_-_20px))] md:pb-8"
    >
      <SeoMetadata
        title={`${product.title} | SALT Online Store`}
        description={`${productSummary}${subtitle ? ` ${subtitle}.` : ""}`}
        canonicalPath={`/products/${product.handle}`}
        image={primaryImage || undefined}
        ogType="product"
        structuredData={seoStructuredData}
      />
      <Reveal>
        <InnerBreadcrumbs
          className="hidden sm:flex"
          items={[
            { label: "Home", to: "/" },
            { label: "Shop", to: "/shop" },
            { label: product.title },
          ]}
        />
      </Reveal>

      <Reveal>
        <Link to="/shop" className="salt-outline-chip mt-2 h-9 gap-2 px-3.5 py-0 text-[0.7rem] sm:mt-3 sm:h-10 sm:px-4 sm:text-xs">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
      </Reveal>

      <div className="mt-3 overflow-hidden rounded-[2rem] border border-border/70 bg-background shadow-[0_28px_70px_-52px_rgba(15,23,42,0.24)] sm:mt-4">
        <div className="grid gap-3 sm:gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start lg:gap-4">
          <Reveal className="salt-reveal-instant lg:self-start">
            <div className="bg-background p-3 sm:p-4 lg:p-5">
              <div className="grid gap-3 lg:grid-cols-[92px_minmax(0,1fr)] lg:items-start">
                <div className="hidden max-h-[50rem] flex-col gap-2.5 lg:flex">
                  {heroThumbnailSources.map((source, index) => {
                    const isSelected = (activeImage || primaryImage) === source;

                    return (
                      <button
                        key={`${source}-${index}`}
                        type="button"
                        onClick={() => setActiveImage(source)}
                        className={`overflow-hidden rounded-[1rem] border bg-background/90 transition ${
                          isSelected
                            ? "border-primary shadow-[0_12px_24px_-20px_hsl(var(--primary)/0.8)]"
                            : "border-border/75 hover:border-primary/45"
                        }`}
                        aria-label={`View product image ${index + 1}`}
                      >
                        <img
                          src={productImageAtWidth(source, 180)}
                          alt={`${product.title} view ${index + 1}`}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="relative overflow-hidden rounded-[1.45rem] border border-border/70 bg-background p-2 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.22)] sm:p-2.5">
                  <div className="overflow-hidden rounded-[1.2rem] bg-background">
                    {activeImage || primaryImage ? (
                      <img
                        ref={heroImageRef}
                        src={productImageAtWidth(displayedImage, 1080)}
                        srcSet={productImageSrcSet(displayedImage)}
                        sizes="(min-width: 1024px) 56vw, 100vw"
                        alt={product.title}
                        className="aspect-square w-full object-contain"
                        decoding="async"
                        onLoad={() => window.dispatchEvent(new Event("salt:product-media-ready"))}
                        onError={() => window.dispatchEvent(new Event("salt:product-media-ready"))}
                      />
                    ) : (
                      <div className="grid aspect-square w-full place-items-center bg-[radial-gradient(circle_at_28%_22%,hsl(var(--primary)/0.2),transparent_44%),radial-gradient(circle_at_75%_82%,hsl(var(--salt-blue)/0.2),transparent_42%),hsl(var(--muted))] px-3 text-center">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          Image unavailable
                        </p>
                      </div>
                    )}
                  </div>
                  {imageSources.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => moveGallery(-1)}
                        className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-[0_12px_24px_-16px_rgba(15,23,42,0.3)] transition hover:scale-105"
                        aria-label="Previous product image"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGallery(1)}
                        className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-[0_12px_24px_-16px_rgba(15,23,42,0.3)] transition hover:scale-105"
                        aria-label="Next product image"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  ) : null}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.08))]" />
                  <div className="absolute left-4 top-4 inline-flex items-center rounded-full border border-border/70 bg-background/88 px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.28)] backdrop-blur">
                    {imageSources.length} photos
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:hidden">
                {heroThumbnailSources.map((source, index) => (
                  <button
                    key={`${source}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(source)}
                    className={`overflow-hidden rounded-[0.9rem] border bg-background/90 transition ${
                      (activeImage || primaryImage) === source
                        ? "border-primary shadow-[0_12px_24px_-20px_hsl(var(--primary)/0.8)]"
                        : "border-border/75 hover:border-primary/45"
                    }`}
                    aria-label={`View product image ${index + 1}`}
                  >
                    <img
                      src={productImageAtWidth(source, 180)}
                      alt={`${product.title} view ${index + 1}`}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
              <div className="mt-3 hidden gap-3">
                <div className="salt-section-shell rounded-[1.45rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Fast facts</p>
                      <h2 className="mt-1 text-sm font-semibold text-foreground">Why shoppers trust it</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Desktop
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      { label: "Rating", value: reviewBadgeLabel },
                      { label: "Availability", value: isAvailable ? "Ready to ship" : "Unavailable" },
                      {
                        label: "Demand",
                        value: purchasedLastMonth > 0 ? `${purchasedLastMonth.toLocaleString()} bought last month` : "Fresh stock",
                      },
                      {
                        label: "Value",
                        value: savingsAmount > 0 ? `${formatMoney(savingsAmount)} saved` : "Everyday value",
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border/75 bg-background/85 px-3 py-2.5">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {stat.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-5 text-foreground">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="salt-section-shell rounded-[1.45rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Quick notes</p>
                      <h2 className="mt-1 text-sm font-semibold text-foreground">Useful at a glance</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Curated
                    </span>
                  </div>
                  {detailBullets.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {detailBullets.slice(0, 3).map((bullet, index) => (
                        <li key={`${bullet}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground/90">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="line-clamp-3">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Compact, premium presentation with the essentials kept close.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

        <Reveal className="salt-reveal-instant lg:self-start">
          <aside
            className="bg-background p-4 sm:p-5 lg:sticky lg:top-24 lg:border-l lg:border-border/70"
            data-salt-minimum-quantity={quantityFloor}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/90 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-primary shadow-[0_12px_24px_-20px_rgba(15,23,42,0.2)]">
                    SALT
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{brandLabel}</p>
                    {reviewSummary ? (
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        {reviewSummary.rating.toFixed(1)} ({reviewSummary.reviewCount.toLocaleString()})
                      </p>
                    ) : null}
                  </div>
                </div>
                <h1 className="mt-4 font-display text-[clamp(1.95rem,3vw,3.15rem)] leading-[0.98] text-foreground">
                  {product.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-0.5" aria-label={reviewSummary ? `${reviewSummary.rating.toFixed(1)} out of 5 stars` : "No ratings yet"}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {reviewSummary ? `${reviewSummary.reviewCount.toLocaleString()} ${reviewSummary.reviewCount === 1 ? "rating" : "ratings"}` : "No ratings yet"}
                  </span>
                  {purchasedLastMonth > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                      {purchasedLastMonth.toLocaleString()} bought last month
                    </span>
                  ) : null}
                </div>
              </div>
              {badgeText ? (
                <div className="shrink-0 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-primary">
                  {badgeText}
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-baseline gap-2">
              <strong className="font-display text-[clamp(2rem,4vw,3.25rem)] text-foreground">{formatMoney(price)}</strong>
              {comparePrice > price ? <s className="text-base font-medium text-muted-foreground">{formatMoney(comparePrice)}</s> : null}
              {discountPercent > 0 ? (
                <span className="rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                  {discountPercent}% off
                </span>
              ) : null}
              {savingsAmount > 0 ? (
                <span className="sr-only">Save {formatMoney(savingsAmount)}</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">
              {isAvailable ? "Free shipping on eligible US orders" : "Currently unavailable"}
            </p>
            {reviewSummary ? (
              <div className="hidden mt-2.5 rounded-[1.2rem] border border-border/75 bg-background/90 p-3 shadow-[0_14px_26px_-22px_rgba(15,23,42,0.16)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Shopper confidence</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Verified ratings and history</p>
                  </div>
                  <p className="text-[0.68rem] font-bold text-foreground">{reviewConfidenceScore}%</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 font-semibold text-foreground">
                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    {reviewSummary.rating.toFixed(1)}
                  </span>
                  <span className="font-medium text-foreground/90">{reviewSummary.reviewCount.toLocaleString()} total reviews</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${reviewConfidenceScore}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">{reviewConfidenceLabel}</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <p className={`rounded-full border px-3 py-1 text-xs font-semibold ${isAvailable ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {isAvailable ? "In stock" : "Out of stock"}
              </p>
            </div>
            {quantityFloor > 1 ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Shop floor: buy {quantityFloor}.
              </p>
            ) : null}

            {!nativeApp ? (
              <div className="hidden mt-4 rounded-[1.2rem] border border-border/80 bg-background/92 p-4 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Key details</p>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">Summary</h2>
                  </div>
                  <span className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {detailBullets.length > 0 ? `${detailBullets.length} notes` : "Live summary"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{productSummary}</p>
                {customHighlights.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customHighlights.slice(0, 3).map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full border border-border/70 bg-background px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-foreground"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>
                ) : null}
                {detailBullets.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {detailBullets.slice(0, 2).map((bullet, index) => (
                      <li key={`${bullet}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground/90">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="line-clamp-3">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {nativeApp ? (
              <div className="hidden mt-4 space-y-3">
                <section className="rounded-[1.2rem] border border-border/80 bg-background/92 p-4 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Key details</p>
                      <h2 className="mt-1 text-sm font-semibold text-foreground">Summary</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      {detailBullets.length > 0 ? `${detailBullets.length} notes` : "Live summary"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{productSummary}</p>
                  {customHighlights.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {customHighlights.slice(0, 3).map((highlight) => (
                        <span
                          key={highlight}
                          className="rounded-full border border-border/70 bg-background px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-foreground"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {detailBullets.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {detailBullets.slice(0, 2).map((bullet, index) => (
                        <li key={`${bullet}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground/90">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="line-clamp-3">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section className="rounded-[1.45rem] border border-border/80 bg-background/92 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Specs</p>
                      <h2 className="mt-1 text-sm font-semibold text-foreground">At a glance</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      {productSpecs.length > 0 ? `${productSpecs.length} notes` : "Live"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {productSpecs.length > 0 ? (
                      productSpecs.map((spec) => (
                        <div key={`${spec.label}-${spec.value}`} className="rounded-xl border border-border/75 bg-background px-3 py-2.5">
                          <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            {spec.label}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                            {spec.value}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/25 px-3 py-3 text-sm leading-6 text-muted-foreground sm:col-span-2">
                        More detail appears below.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {variants.length > 0 ? (
              <div className="mt-5 space-y-5 border-t border-border/70 pt-5">
                {variantOptionGroups.map((group, groupIndex) => (
                  <section key={group.label} aria-label={`${group.label} options`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {group.label} <span className="font-normal text-muted-foreground">{selectedVariantParts[groupIndex] || "Choose"}</span>
                      </p>
                      {groupIndex === 0 && availableVariantsCount < variants.length ? (
                        <span className="text-[0.68rem] font-medium text-muted-foreground">
                          {availableVariantsCount} of {variants.length} available
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.values.map((value) => {
                        const valueAvailable = variants.some(
                          (variant) => variantOptionParts(variant.title)[groupIndex] === value && isVariantAvailable(variant),
                        );
                        const valueSelected = selectedVariantParts[groupIndex] === value;

                        return (
                          <button
                            key={`${group.label}-${value}`}
                            type="button"
                            onClick={() => selectVariantOption(groupIndex, value)}
                            disabled={!valueAvailable}
                            aria-pressed={valueSelected ? "true" : "false"}
                            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                              valueSelected
                                ? "border-foreground bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]"
                                : valueAvailable
                                  ? "border-border bg-background text-foreground hover:border-foreground"
                                  : "cursor-not-allowed border-border/60 bg-muted/80 text-muted-foreground/70"
                            }`}
                          >
                            <span className={!valueAvailable ? "line-through" : ""}>{value}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            <div className="mt-3.5">
              <p className="text-sm font-semibold">Quantity</p>
              <div className="mt-2 inline-flex h-11 w-full items-center justify-between rounded-full border border-border bg-background sm:w-auto">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(quantityFloor, value - 1))}
                  disabled={quantity <= quantityFloor}
                  className="inline-flex h-11 w-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center text-sm font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                  className="inline-flex h-11 w-11 items-center justify-center"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {quantityFloor > 1 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Shop floor: buy {quantityFloor}.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={addToCart}
              disabled={!isAvailable}
              className="salt-primary-cta mt-5 h-12 w-full gap-2 rounded-full px-5 text-base font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {isAvailable ? "Add to cart" : "Unavailable"}
            </button>

            <a
              href={checkoutTargetUrl}
              onClick={handleBuyNowClick}
              aria-disabled={isAvailable ? "false" : "true"}
              className={`mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-base font-semibold text-background transition hover:-translate-y-[1px] hover:opacity-90 ${
                isAvailable ? "" : "pointer-events-none opacity-60"
              }`}
            >
              Buy now
            </a>

            <button
              type="button"
              onClick={toggleWishlistState}
              aria-pressed={wishlisted ? "true" : "false"}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Heart className={`h-4 w-4 ${wishlisted ? "fill-primary/20 text-primary" : ""}`} />
              {wishlisted ? "Saved to wishlist" : "Save to wishlist"}
            </button>

            <button
              type="button"
              onClick={() => void shareProduct()}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>


            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Link
                to={product.product_type ? `/shop?type=${encodeURIComponent(product.product_type)}` : "/shop"}
                className="salt-outline-chip h-10 justify-center rounded-full px-3 py-0 text-[0.68rem]"
              >
                Similar products
              </Link>
              <Link
                to="/contact"
                className="salt-outline-chip h-10 justify-center rounded-full px-3 py-0 text-[0.68rem]"
              >
                Ask support
              </Link>
            </div>

            <Accordion type="multiple" className="mt-4 rounded-[1.45rem] border border-border/80 bg-card/86 px-4">
              <AccordionItem value="details" className="border-border/70">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Product details
                </AccordionTrigger>
                <AccordionContent>
                  <div
                    className="salt-product-description pb-4 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(product.body_html) }}
                  />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="shipping" className="border-border/70">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Shipping and returns
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">
                  Shipping and taxes are calculated at Shopify checkout. Eligible items can be returned within the policy window.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="service" className="border-none">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Why shoppers choose SALT
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">
                  Curated assortment, clearer variant selection, visible savings, and support that stays close.
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 rounded-[1.45rem] border border-border/80 bg-background p-3">
              <TrustStrip
                items={[
                  { icon: Truck, label: "Free US shipping" },
                  { icon: PackageCheck, label: "Tracked fulfillment" },
                  { icon: ShieldCheck, label: "30-day returns" },
                  { icon: BadgeCheck, label: "Secure payment" },
                ]}
              />
              {purchasedLastMonth > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {purchasedLastMonth.toLocaleString()} shoppers bought this in the last month.
                </p>
              ) : null}
            </div>
          </aside>
        </Reveal>
      </div>
      </div>

      <div ref={secondaryContentAnchorRef} aria-hidden="true" className="h-px" />
      {loadSecondaryContent ? (
        <Suspense fallback={null}>
          <ShopifyProductReviews productId={product.id} productHandle={product.handle} />
        </Suspense>
      ) : null}

      {relatedProducts.length > 0 ? (
        <section className="mt-8">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Related</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">You may also like</h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
              {relatedProducts.map((related, index) => (
                <Reveal key={related.id} delayMs={index * 70} className="h-full">
                  <ProductCard
                    product={related}
                    variant="shop"
                    reviewSummary={relatedCardRatingsById[related.id] ?? null}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {complementaryProducts.length > 0 ? (
        <section className="mt-6">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Bundle</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">Pairs well with this product</h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
              {complementaryProducts.map((entry, index) => (
                <Reveal key={entry.id} delayMs={index * 70} className="h-full">
                  <ProductCard
                    product={entry}
                    variant="shop"
                    reviewSummary={relatedCardRatingsById[entry.id] ?? null}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {recentlyViewedProducts.length > 0 ? (
        <section className="mt-6">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Recently viewed</p>
                <h2 className="inline-flex items-center gap-2 font-display text-[clamp(1.6rem,2.4vw,2.3rem)]">
                  <History className="h-5 w-5 text-primary" /> Continue exploring
                </h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
              {recentlyViewedProducts.map((entry, index) => (
                <Reveal key={entry.id} delayMs={index * 55} className="h-full">
                  <ProductCard
                    product={entry}
                    variant="shop"
                    reviewSummary={relatedCardRatingsById[entry.id] ?? null}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 px-3 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto flex w-[min(1280px,100%)] items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {isAvailable ? "Ready to ship" : "Unavailable"}
            </p>
            <p className="font-display text-[1.45rem] leading-none text-primary">{formatMoney(price)}</p>
          </div>
          <button
            type="button"
            onClick={toggleWishlistState}
            aria-pressed={wishlisted ? "true" : "false"}
            aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Heart className={`h-4.5 w-4.5 ${wishlisted ? "fill-primary/20 text-primary" : ""}`} />
          </button>
          <button
            type="button"
            onClick={addToCart}
            disabled={!isAvailable}
            className="salt-yellow-cta h-12 flex-1 gap-2 rounded-full px-5 text-sm font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingBag className="h-4 w-4" />
            {isAvailable ? "Add to cart" : "Unavailable"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductPage;
