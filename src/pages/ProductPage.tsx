import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  Heart,
  History,
  LoaderCircle,
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
import BrandLogo from "@/components/layout/BrandLogo";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import ProductCard from "@/components/storefront/ProductCard";
import ProductRating from "@/components/storefront/ProductRating";
import Reveal from "@/components/storefront/Reveal";
import SeoMetadata from "@/components/storefront/SeoMetadata";
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
  formatMoney,
  isPlausibleComparePrice,
  productBenefitText,
  productImage,
  sanitizeRichHtml,
} from "@/lib/formatters";
import { useJudgeMeProductRating, useJudgeMeRatings } from "@/lib/judgeme";
import { openExternalUrl } from "@/lib/mobile";
import { rememberRecentlyViewedHandle } from "@/lib/recently-viewed";
import {
  getStoreCurrencyCode,
  scheduleMetaPixelTask,
  trackMetaPixelInitiateCheckout,
  trackMetaPixelViewContent,
} from "@/lib/meta-pixel";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import { recordDeviceOrderHistory } from "@/lib/order-history";
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

const PRODUCT_PAGE_RUNTIME_VERSION = "2026-08-11.1";
const MAX_QUANTITY = 99;
const ShopifyProductReviews = lazy(() => import("@/components/storefront/ShopifyProductReviews"));

type ProductOptionDefinition = {
  name: string;
  values: string[];
};

type ProductWithOptions = ShopifyProduct & {
  options?: Array<string | { name?: string; values?: string[]; position?: number }>;
};

type VariantWithOptions = ShopifyProduct["variants"][number] & {
  options?: string[];
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

function isVariantAvailable(variant?: ShopifyProduct["variants"][number] | null): boolean {
  return variant?.available !== false;
}

function productVariantImage(
  product: ShopifyProduct,
  variant?: ShopifyProduct["variants"][number] | null,
): string | null {
  if (!variant) {
    return productImage(product);
  }

  const linkedImage = (product.images || []).find((image) => image.variant_ids?.includes(variant.id));
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

  return [640, 960, 1280, 1600]
    .map((width) => `${productImageAtWidth(normalized, width)} ${width}w`)
    .join(", ");
}

function variantOptionValues(variant?: ShopifyProduct["variants"][number] | null): string[] {
  if (!variant) {
    return [];
  }

  const optionVariant = variant as VariantWithOptions;
  const directOptions = Array.isArray(optionVariant.options)
    ? optionVariant.options.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (directOptions.length) {
    return directOptions;
  }

  const namedOptions = [optionVariant.option1, optionVariant.option2, optionVariant.option3]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (namedOptions.length) {
    return namedOptions;
  }

  const title = String(variant.title || "").trim();
  if (!title || title.toLowerCase() === "default title") {
    return [];
  }

  return title.split(/\s*\/\s*/).map((value) => value.trim()).filter(Boolean);
}

function buildProductOptions(product: ShopifyProduct | null, variants: ShopifyProduct["variants"]): ProductOptionDefinition[] {
  if (!product || !variants.length) {
    return [];
  }

  const rawOptions = Array.isArray((product as ProductWithOptions).options)
    ? (product as ProductWithOptions).options || []
    : [];
  const variantValues = variants.map((variant) => variantOptionValues(variant));
  const optionCount = Math.max(rawOptions.length, ...variantValues.map((values) => values.length), 0);

  return Array.from({ length: optionCount }, (_, index) => {
    const rawOption = rawOptions[index];
    const rawName = typeof rawOption === "string" ? rawOption : rawOption?.name;
    const rawValues = typeof rawOption === "object" && rawOption ? rawOption.values || [] : [];
    const values = Array.from(
      new Set(
        [...rawValues, ...variantValues.map((entry) => entry[index])]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    return {
      name: String(rawName || (optionCount === 1 ? "Option" : `Option ${index + 1}`)).trim(),
      values,
    };
  }).filter((option) => option.values.length > 0 && !(option.values.length === 1 && option.values[0].toLowerCase() === "default title"));
}

function optionValueAvailable(
  variants: ShopifyProduct["variants"],
  selectedValues: string[],
  optionIndex: number,
  candidateValue: string,
): boolean {
  return variants.some((variant) => {
    if (!isVariantAvailable(variant)) {
      return false;
    }

    const values = variantOptionValues(variant);
    if (values[optionIndex] !== candidateValue) {
      return false;
    }

    return selectedValues.every((selectedValue, index) =>
      index === optionIndex || !selectedValue || values[index] === selectedValue,
    );
  });
}

function extractNumericId(input?: string | number | null): string {
  const text = String(input ?? "").trim();
  if (!text) {
    return "";
  }
  return text.match(/\d+/)?.[0] || text;
}

function referenceMatchesProduct(reference: ShopifyProductReference | null | undefined, product: ShopifyProduct): boolean {
  if (!reference) {
    return false;
  }

  const referenceId = extractNumericId(reference.legacyResourceId ?? reference.id);
  if (referenceId && referenceId === String(product.id)) {
    return true;
  }

  return String(reference.handle || "").trim().toLowerCase() === String(product.handle || "").trim().toLowerCase();
}

function resolveProductReferences(
  references: ShopifyProductReference[] | null | undefined,
  products: ShopifyProduct[],
): ShopifyProduct[] {
  if (!Array.isArray(references) || !references.length) {
    return [];
  }

  const seen = new Set<number>();
  return references.reduce<ShopifyProduct[]>((resolved, reference) => {
    const match = products.find((product) => referenceMatchesProduct(reference, product));
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      resolved.push(match);
    }
    return resolved;
  }, []);
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

async function copyProductLink(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

const ProductPage = () => {
  const { handle } = useParams();
  const { addItem } = useCart();
  const { isWishlisted, toggleItem } = useWishlist();
  const { data: productData, isLoading, error, refetch } = useProductByHandle(handle, true, true);
  const product = useMemo(() => productData, [productData]);
  const primaryProductImage = product ? productImage(product) || "" : "";
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const secondaryContentAnchorRef = useRef<HTMLDivElement | null>(null);
  const [secondaryContentProductId, setSecondaryContentProductId] = useState<number | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [recentHandles, setRecentHandles] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const loadSecondaryContent = Boolean(product?.id && secondaryContentProductId === product.id);
  const { data: collectionProductsMapPayload } = useCollectionProductsMap(Boolean(product && loadSecondaryContent));
  const { data: productSearchPayload } = useProductSearchIndex(Boolean(product && loadSecondaryContent));
  const products = useMemo(() => productSearchPayload?.products ?? [], [productSearchPayload]);
  const collectionIndex = useMemo(
    () => buildProductCollectionIndex(collectionProductsMapPayload),
    [collectionProductsMapPayload],
  );
  const variants = useMemo(() => (product?.variants || []).filter(Boolean), [product]);
  const initialVariant = useMemo(
    () => variants.find((variant) => isVariantAvailable(variant)) || variants[0],
    [variants],
  );
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || variants[0],
    [selectedVariantId, variants],
  );
  const quantityFloor = useMemo(
    () => getMinimumProductQuantity(
      product?.handle,
      Number(selectedVariant?.price || 0),
      product?.customData?.shopChannelMinimumQuantity,
    ),
    [product?.customData?.shopChannelMinimumQuantity, product?.handle, selectedVariant?.price],
  );
  const optionDefinitions = useMemo(() => buildProductOptions(product, variants), [product, variants]);
  const selectedOptionValues = useMemo(() => variantOptionValues(selectedVariant), [selectedVariant]);
  const imageSources = useMemo(() => {
    if (!product) {
      return [];
    }

    const candidates = [
      ...(product.images || []).map((image) => image.src),
      ...variants.map((variant) => productVariantImage(product, variant)),
      primaryProductImage,
    ];
    return Array.from(new Set(candidates.map((source) => normalizeShopifyAssetUrl(source)).filter(Boolean))) as string[];
  }, [primaryProductImage, product, variants]);
  const displayedImage = activeImage || imageSources[0] || primaryProductImage;
  const activeImageIndex = Math.max(0, imageSources.findIndex((source) => source === displayedImage));
  const productRatingQuery = useJudgeMeProductRating(product?.id);
  const reviewSummary = productRatingQuery.summary || null;

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new Event("salt:product-media-loading"));
    return () => window.dispatchEvent(new Event("salt:product-media-ready"));
  }, [handle]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) {
      return;
    }
    if (error || !product || !primaryProductImage || heroImageRef.current?.complete) {
      window.dispatchEvent(new Event("salt:product-media-ready"));
    }
  }, [error, isLoading, primaryProductImage, product]);

  useEffect(() => {
    if (!product) {
      return;
    }
    setSelectedVariantId(initialVariant?.id || 0);
    setQuantity(getMinimumProductQuantity(
      product.handle,
      Number(initialVariant?.price || 0),
      product.customData?.shopChannelMinimumQuantity,
    ));
    setActiveImage(productVariantImage(product, initialVariant) || productImage(product) || "");
  }, [initialVariant, product]);

  useEffect(() => {
    if (product && selectedVariant) {
      setActiveImage(productVariantImage(product, selectedVariant) || productImage(product) || "");
    }
  }, [product, selectedVariant]);

  useEffect(() => {
    setQuantity((current) => Math.max(quantityFloor, current));
  }, [quantityFloor]);

  useEffect(() => {
    if (product) {
      setRecentHandles(rememberRecentlyViewedHandle(product.handle));
    }
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
    const compareCandidate = Number(selectedVariant.compare_at_price || 0);
    const selectedComparePrice = isPlausibleComparePrice(selectedPrice, compareCandidate) ? compareCandidate : 0;
    window.dispatchEvent(new CustomEvent("salt:product-variant-change", {
      detail: {
        handle: product.handle,
        variantId: selectedVariant.id,
        price: selectedPrice,
        compareAtPrice: selectedComparePrice || null,
        title: selectedVariant.title,
      },
    }));
  }, [product, selectedVariant]);

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

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSecondaryContentProductId(productId);
        observer.disconnect();
      }
    }, { rootMargin: "180px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [handle, product?.id]);

  const manualRelatedProducts = useMemo(
    () => resolveProductReferences(product?.customData?.relatedProducts, products).filter((entry) => entry.id !== product?.id),
    [product?.customData?.relatedProducts, product?.id, products],
  );
  const manualComplementaryProducts = useMemo(
    () => resolveProductReferences(product?.customData?.complementaryProducts, products).filter((entry) => entry.id !== product?.id),
    [product?.customData?.complementaryProducts, product?.id, products],
  );
  const automaticRelatedProducts = useMemo(
    () => product ? pickRelatedProducts(product, products, {
      collectionIndex,
      limit: 5,
      excludedIds: new Set<number>([product.id, ...manualRelatedProducts.map((entry) => entry.id)]),
    }) : [],
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
    return dedupeProducts([...manualRelatedProducts, ...automaticRelatedProducts]).slice(0, 5);
  }, [automaticRelatedProducts, manualRelatedProducts, product]);
  const automaticComplementaryProducts = useMemo(
    () => product ? pickComplementaryProducts(product, products, {
      collectionIndex,
      limit: 5,
      excludedIds: new Set<number>([
        product.id,
        ...relatedProducts.map((entry) => entry.id),
        ...manualComplementaryProducts.map((entry) => entry.id),
      ]),
    }) : [],
    [collectionIndex, manualComplementaryProducts, product, products, relatedProducts],
  );
  const complementaryProducts = useMemo(
    () => dedupeProducts([...manualComplementaryProducts, ...automaticComplementaryProducts])
      .filter((entry) => entry.id !== product?.id && !relatedProducts.some((related) => related.id === entry.id))
      .slice(0, 5),
    [automaticComplementaryProducts, manualComplementaryProducts, product?.id, relatedProducts],
  );
  const recentlyViewedProducts = useMemo(
    () => product ? recentHandles
      .filter((entry) => entry !== product.handle)
      .map((entry) => products.find((candidate) => candidate.handle === entry))
      .filter((entry): entry is ShopifyProduct => Boolean(entry))
      .slice(0, 5) : [],
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

  const showPreviousImage = useCallback(() => {
    if (imageSources.length < 2) {
      return;
    }
    setActiveImage(imageSources[(activeImageIndex - 1 + imageSources.length) % imageSources.length]);
  }, [activeImageIndex, imageSources]);
  const showNextImage = useCallback(() => {
    if (imageSources.length < 2) {
      return;
    }
    setActiveImage(imageSources[(activeImageIndex + 1) % imageSources.length]);
  }, [activeImageIndex, imageSources]);
  const handleGalleryKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousImage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextImage();
    }
  }, [showNextImage, showPreviousImage]);

  if (isLoading && !product) {
    return <LoadingState title="Loading product" subtitle="Preparing live product details and options." />;
  }

  if (error && !product) {
    return (
      <ErrorState
        title="We could not load this product"
        subtitle="Please retry or return to the catalog."
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => refetch()} className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Retry
            </button>
            <Link to="/shop" className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-bold">
              Back to shop
            </Link>
          </div>
        )}
      />
    );
  }

  if (!product) {
    return <ErrorState title="Product not found" subtitle="The requested product is unavailable." />;
  }

  const price = Number(selectedVariant?.price || 0);
  const compareCandidate = Number(selectedVariant?.compare_at_price || 0);
  const comparePrice = isPlausibleComparePrice(price, compareCandidate) ? compareCandidate : 0;
  const savingsAmount = comparePrice > price ? comparePrice - price : 0;
  const discountPercent = savingsAmount > 0 ? Math.round((savingsAmount / comparePrice) * 100) : 0;
  const isAvailable = isVariantAvailable(selectedVariant);
  const selectedQuantity = Math.min(MAX_QUANTITY, Math.max(quantityFloor, Math.floor(quantity || 1)));
  const checkoutTargetUrl = selectedVariant
    ? buildShopifyDirectCheckoutUrl(selectedVariant.id, selectedQuantity)
    : buildShopifyCartUrl();
  const productSummary = productBenefitText(product, 170);
  const wishlisted = isWishlisted(product.handle);
  const brandLabel = product.vendor?.trim() || "SALT";

  const selectOptionValue = (optionIndex: number, value: string) => {
    const nextValues = [...selectedOptionValues];
    nextValues[optionIndex] = value;
    const matchingVariants = variants.filter((variant) => {
      const values = variantOptionValues(variant);
      return nextValues.every((selectedValue, index) => !selectedValue || values[index] === selectedValue);
    });
    const nextVariant = matchingVariants.find((variant) => isVariantAvailable(variant)) || matchingVariants[0];
    if (nextVariant) {
      setSelectedVariantId(nextVariant.id);
    }
  };

  const toggleWishlistState = () => {
    const nextSaved = !wishlisted;
    toggleItem(wishlistItemFromProduct(product));
    toast.success(nextSaved ? "Saved to wishlist" : "Removed from wishlist", { description: product.title });
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.title, url: shareUrl });
        return;
      }
      await copyProductLink(shareUrl);
      toast.success("Product link copied");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return;
      }
      try {
        await copyProductLink(shareUrl);
        toast.success("Product link copied");
      } catch {
        toast.error("Unable to share this product");
      }
    }
  };

  const handleBuyNowClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!selectedVariant || !isAvailable) {
      return;
    }

    const checkoutItem = {
      id: selectedVariant.id,
      shopifyVariantId: selectedVariant.id,
      handle: product.handle,
      title: `${product.title} (${selectedVariant.title})`,
      image: displayedImage,
      unitPrice: price,
      quantity: selectedQuantity,
      productType: product.product_type,
    };
    trackMetaPixelInitiateCheckout([checkoutItem]);
    recordDeviceOrderHistory({ source: "buy-now", checkoutUrl: checkoutTargetUrl, items: [checkoutItem] });
    void openExternalUrl(checkoutTargetUrl);
  };

  const addToCart = () => {
    if (!selectedVariant || !isAvailable || isAdding) {
      return;
    }

    setIsAdding(true);
    try {
      addItem({
        id: selectedVariant.id,
        shopifyVariantId: selectedVariant.id,
        handle: product.handle,
        title: `${product.title} (${selectedVariant.title})`,
        image: displayedImage,
        unitPrice: price,
        productType: product.product_type,
        minimumQuantity: product.customData?.shopChannelMinimumQuantity || quantityFloor,
      }, selectedQuantity);
      toast.success("Added to cart", { description: `${selectedQuantity} x ${product.title}` });
    } catch {
      toast.error("Unable to add this item to cart");
    } finally {
      window.setTimeout(() => setIsAdding(false), 350);
    }
  };

  const renderProductRail = (items: ShopifyProduct[], heading: string, eyebrow: string, icon?: boolean) => (
    <section className="mt-8">
      <Reveal>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
          <h2 className="inline-flex items-center gap-2 font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">
            {icon ? <History className="h-5 w-5 text-primary" /> : null}{heading}
          </h2>
        </div>
      </Reveal>
      <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((entry, index) => (
            <Reveal key={entry.id} delayMs={index * 55} className="h-full">
              <ProductCard product={entry} variant="shop" reviewSummary={relatedCardRatingsById[entry.id] ?? null} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <section
      data-salt-product-runtime={PRODUCT_PAGE_RUNTIME_VERSION}
      className="mx-auto w-[min(1440px,calc(100%_-_24px))] pb-24 pt-4 sm:w-[min(1440px,calc(100%_-_40px))] md:pb-10 lg:pt-6"
    >
      <SeoMetadata
        title={`${product.title} | SALT Online Store`}
        description={productSummary}
        canonicalPath={`/products/${product.handle}`}
        image={primaryProductImage || undefined}
        ogType="product"
        structuredData={seoStructuredData}
      />

      <Reveal>
        <InnerBreadcrumbs
          className="hidden sm:flex"
          items={[{ label: "Home", to: "/" }, { label: "Shop", to: "/shop" }, { label: product.title }]}
        />
        <Link to="/shop" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
      </Reveal>

      <div className="mt-4 grid items-start gap-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(390px,0.88fr)] lg:gap-10 xl:gap-14">
        <Reveal className="salt-reveal-instant min-w-0">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[78px_minmax(0,1fr)] lg:gap-4">
            <div className="order-2 flex snap-x gap-2.5 overflow-x-auto pb-1 lg:order-1 lg:max-h-[690px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1">
              {imageSources.map((source, index) => {
                const isSelected = index === activeImageIndex;
                return (
                  <button
                    key={`${source}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(source)}
                    className={`h-[70px] w-[70px] shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      isSelected ? "border-foreground" : "border-transparent hover:border-border"
                    }`}
                    aria-label={`View image ${index + 1} of ${imageSources.length}`}
                    aria-current={isSelected ? "true" : undefined}
                  >
                    <img
                      src={productImageAtWidth(source, 180)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading={index === 0 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  </button>
                );
              })}
            </div>

            <div
              className="group relative order-1 aspect-square min-w-0 overflow-hidden rounded-[1.75rem] bg-[#f7f7f7] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:order-2"
              tabIndex={0}
              onKeyDown={handleGalleryKeyDown}
              aria-label={`Product gallery, image ${activeImageIndex + 1} of ${Math.max(1, imageSources.length)}. Use left and right arrow keys to navigate.`}
            >
              {displayedImage ? (
                <img
                  ref={heroImageRef}
                  key={displayedImage}
                  src={productImageAtWidth(displayedImage, 1280)}
                  srcSet={productImageSrcSet(displayedImage)}
                  sizes="(min-width: 1024px) 56vw, 100vw"
                  alt={product.title}
                  className="h-full w-full object-contain"
                  loading={activeImageIndex === 0 ? "eager" : "lazy"}
                  fetchPriority={activeImageIndex === 0 ? "high" : "auto"}
                  decoding="async"
                  onLoad={() => window.dispatchEvent(new Event("salt:product-media-ready"))}
                  onError={() => window.dispatchEvent(new Event("salt:product-media-ready"))}
                />
              ) : (
                <div className="grid h-full place-items-center px-6 text-sm font-semibold text-muted-foreground">Image unavailable</div>
              )}

              {imageSources.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={showPreviousImage}
                    className="absolute left-4 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-black/5 bg-white text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="View previous product image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextImage}
                    className="absolute right-4 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-black/5 bg-white text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="View next product image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              ) : null}

              <span className="absolute bottom-4 right-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-black shadow-sm">
                {activeImageIndex + 1} / {Math.max(1, imageSources.length)}
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal className="salt-reveal-instant min-w-0 lg:sticky lg:top-24">
          <aside
            data-salt-minimum-quantity={quantityFloor}
            className="salt-panel-shell min-w-0 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo size="sm" className="h-12 w-12 shrink-0 rounded-full border border-border bg-white p-1" />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{brandLabel}</p>
                  {reviewSummary ? (
                    <button
                      type="button"
                      onClick={() => secondaryContentAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="mt-0.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <ProductRating summary={reviewSummary} className="text-xs" />
                    </button>
                  ) : productRatingQuery.isLoading ? (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading live reviews
                    </span>
                  ) : (
                    <span className="mt-1 text-xs text-muted-foreground">No Judge.me reviews yet</span>
                  )}
                </div>
              </div>
            </div>

            <h1 className="mt-6 text-[clamp(2rem,3.3vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground">
              {product.title}
            </h1>
            {reviewSummary ? (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-0.5 text-amber-500" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} className={`h-5 w-5 ${index < Math.round(reviewSummary.rating) ? "fill-current" : "text-amber-200"}`} />
                  ))}
                </span>
                <span className="font-medium">{reviewSummary.reviewCount.toLocaleString()} {reviewSummary.reviewCount === 1 ? "rating" : "ratings"}</span>
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
              <strong className="text-[clamp(2rem,3vw,2.7rem)] font-semibold leading-none tracking-[-0.03em] text-foreground">{formatMoney(price)}</strong>
              {comparePrice > price ? <s className="text-xl font-medium text-muted-foreground">{formatMoney(comparePrice)}</s> : null}
              {discountPercent > 0 ? (
                <span className="rounded-full bg-foreground px-3 py-1.5 text-sm font-bold text-background">{discountPercent}% off</span>
              ) : null}
            </div>

            <div className="mt-4 flex items-center gap-2 text-base font-medium text-foreground">
              <Truck className="h-5 w-5" aria-hidden="true" /> Tracked shipping after dispatch
            </div>

            {savingsAmount > 0 ? (
              <div className="mt-7 flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BadgePercent className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-bold text-foreground">Save {formatMoney(savingsAmount)} today</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{discountPercent}% below this variant's compare-at price</p>
                </div>
              </div>
            ) : null}

            <div className="mt-7 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isAvailable ? "bg-emerald-500" : "bg-destructive"}`} aria-hidden="true" />
              <p className="text-sm font-semibold">{isAvailable ? "In stock" : "Sold out"}</p>
            </div>

            {optionDefinitions.length > 0 ? (
              <div className="mt-7 space-y-6">
                {optionDefinitions.map((option, optionIndex) => (
                  <fieldset key={`${option.name}-${optionIndex}`}>
                    <legend className="text-base font-semibold">
                      {option.name}{selectedOptionValues[optionIndex] ? <span className="ml-1 font-normal text-muted-foreground">{selectedOptionValues[optionIndex]}</span> : null}
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {option.values.map((value) => {
                        const selected = selectedOptionValues[optionIndex] === value;
                        const available = optionValueAvailable(variants, selectedOptionValues, optionIndex, value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => selectOptionValue(optionIndex, value)}
                            disabled={!available}
                            aria-pressed={selected}
                            className={`min-h-12 rounded-full border-2 px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                              selected
                                ? "border-foreground bg-background text-foreground"
                                : "border-border bg-background text-foreground hover:border-foreground/50"
                            } ${available ? "" : "cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60"}`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            ) : null}

            <div className="mt-7">
              <p className="text-base font-semibold">Quantity</p>
              <div className="mt-3 inline-flex h-12 items-center rounded-full border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(quantityFloor, value - 1))}
                  disabled={quantity <= quantityFloor}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-l-full disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <output className="min-w-12 text-center text-base font-semibold" aria-live="polite">{selectedQuantity}</output>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(MAX_QUANTITY, value + 1))}
                  disabled={quantity >= MAX_QUANTITY}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-r-full disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {quantityFloor > 1 ? <p className="mt-2 text-xs text-muted-foreground">Minimum quantity: {quantityFloor}</p> : null}
            </div>

            <button
              type="button"
              onClick={addToCart}
              disabled={!isAvailable || isAdding}
              className="salt-primary-cta mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full !bg-[#5833f3] px-6 text-base font-bold !text-white shadow-[0_14px_30px_rgba(88,51,243,0.2)] transition hover:!bg-[#4f2be0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5833f3] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAdding ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
              {isAvailable ? (isAdding ? "Adding…" : `Add to cart · ${formatMoney(price * selectedQuantity)}`) : "Sold out"}
            </button>
            <a
              href={checkoutTargetUrl}
              onClick={handleBuyNowClick}
              aria-disabled={!isAvailable}
              tabIndex={isAvailable ? 0 : -1}
              className={`mt-3 inline-flex h-14 w-full items-center justify-center rounded-full bg-zinc-950 px-6 text-base font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
                isAvailable ? "" : "pointer-events-none opacity-50"
              }`}
            >
              Buy now
            </a>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={toggleWishlistState}
                aria-pressed={wishlisted}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold transition hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Heart className={`h-5 w-5 ${wishlisted ? "fill-current text-primary" : ""}`} />
                {wishlisted ? "Saved" : "Wishlist"}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold transition hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Share2 className="h-5 w-5" /> Share
              </button>
            </div>
          </aside>
        </Reveal>
      </div>

      <section className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Accordion type="multiple" defaultValue={["details"]} className="rounded-2xl border border-border bg-card px-5 sm:px-6">
          <AccordionItem value="details" className="border-border/70">
            <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline">Product details</AccordionTrigger>
            <AccordionContent>
              <div className="salt-product-description pb-5 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(product.body_html) }} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="shipping" className="border-border/70">
            <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline">Shipping and returns</AccordionTrigger>
            <AccordionContent className="pb-5 text-sm leading-6 text-muted-foreground">
              Shipping and taxes are calculated at Shopify checkout. Eligible items can be returned within the policy window.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="service" className="border-none">
            <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline">Why shoppers choose SALT</AccordionTrigger>
            <AccordionContent className="pb-5 text-sm leading-6 text-muted-foreground">
              Curated products, live option availability, secure Shopify checkout, and customer support when you need it.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-bold">Shop with confidence</p>
          <TrustStrip items={[
            { icon: Truck, label: "Tracked shipping" },
            { icon: PackageCheck, label: "Tracked fulfillment" },
            { icon: ShieldCheck, label: "Secure checkout" },
            { icon: BadgeCheck, label: "Support available" },
          ]} />
        </div>
      </section>

      <div ref={secondaryContentAnchorRef} aria-hidden="true" className="h-px scroll-mt-24" />
      {loadSecondaryContent ? (
        <Suspense fallback={null}>
          <ShopifyProductReviews productId={product.id} productHandle={product.handle} />
        </Suspense>
      ) : null}

      {relatedProducts.length > 0 ? renderProductRail(relatedProducts, "You may also like", "Related") : null}
      {complementaryProducts.length > 0 ? renderProductRail(complementaryProducts, "Pairs well with this product", "Bundle") : null}
      {recentlyViewedProducts.length > 0 ? renderProductRail(recentlyViewedProducts, "Continue exploring", "Recently viewed", true) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 px-3 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{isAvailable ? "In stock" : "Sold out"}</p>
            <p className="text-lg font-bold leading-none">{formatMoney(price)}</p>
          </div>
          <button
            type="button"
            onClick={toggleWishlistState}
            aria-pressed={wishlisted}
            aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background"
          >
            <Heart className={`h-5 w-5 ${wishlisted ? "fill-current text-primary" : ""}`} />
          </button>
          <button
            type="button"
            onClick={addToCart}
            disabled={!isAvailable || isAdding}
            className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#5833f3] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {isAdding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
            <span className="truncate">{isAvailable ? (isAdding ? "Adding…" : "Add to cart") : "Sold out"}</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductPage;
