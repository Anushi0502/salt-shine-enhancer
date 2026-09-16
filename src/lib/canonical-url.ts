export const CANONICAL_ORIGIN = "https://www.saltonlinestore.com";

type Cleanup = () => void;

type CanonicalDocumentState = {
  element: HTMLLinkElement;
  created: boolean;
  originalHref: string | null;
  originalRel: string | null;
  entries: Map<symbol, string>;
};

const canonicalDocumentStates = new WeakMap<Document, CanonicalDocumentState>();
const COLLECTION_CANONICAL_ALIASES: Record<string, string> = {
  apparel: "men-collection",
  "cooking-essential": "cookware",
  "holiday-gifts": "gifts",
  "unique-products": "trending-finds",
  "winter-wear": "under-50",
  "clearance-archive": "under-50",
};

// Google has already selected these canonical products for the live duplicate
// URLs. Keep the source URL usable, but make metadata and structured data point
// at the same product instead of competing in the index.
const PRODUCT_CANONICAL_ALIASES: Record<string, string> = {
  "winter-motorcycle-face-mask-balaclava-windproof-thermal-neck-warmer":
    "tactical-motorcycle-face-mask-neck-gaiter-windproof-breathable",
  "ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men-1":
    "ruyi-men-face-cream-moisturizing-nourishing-lotion-face-firming-lifting-anti-puffiness-facial-skin-care-50g-for-men",
  "children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil-1":
    "children-school-bags-girls-boys-primary-school-backpack-schoolbag-kids-book-bag-mochila-infantil",
  "black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-2":
    "black-fashion-adult-waterproof-long-raincoat-women-men-rain-coat-hooded-for-outdoor-hiking-travel-fishing-climbing-thickened-3",
  "anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l-2":
    "anti-frizz-hair-oil-spray-perfumed-smoothing-lightweight-non-greasy-hair-care-oil-for-color-treated-perm-damaged-hair-long-l",
  "jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot-1":
    "jackets-for-women-quilted-padded-lightweight-puffer-woman-coat-hoodie-short-yellow-thick-padding-feather-cropped-cute-modern-hot",
  "car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-rv-motorcycle":
    "car-battery-trickle-charger-and-maintainer-1-5a-6v-12v-truck-trickle-battery-charger-automatic-tender-maintainer-for-motorcycle",
  "women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands-2":
    "women-dark-hair-accessories-set-elastic-seamless-ponytail-scrunchies-small-rubber-bands-fashion-hair-ties-headbands",
  "buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset-1":
    "buds-4-pro-wireless-earbuds-bluetooth-earphones-noise-reduction-headphones-hifi-stereo-sound-built-in-mic-headset",
  "mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook-1":
    "mini-optical-wired-mouse-usb-led-ergonomic-design-mice-for-pc-laptop-notebook",
  "laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case-1":
    "laptop-sleeve-bag-for-macbook-air-pro-13-13-3-14-15-4-15-6-inch-notebook-pouch-for-lenovo-asus-hp-dell-portable-bag-cover-case",
  "school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks-1":
    "school-troilley-bag-set-for-boys-school-trolley-backpack-set-lunch-bag-school-wheeled-backpack-for-boys-school-bookbag-rucksacks",
  "covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover-1":
    "covering-god-almighty-always-loves-me-flame-phone-case-for-iphone-17-15-16-14-13-12-11-pro-max-xr-x-xs-7-plus-transparent-cover",
  "mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags-1":
    "mens-bag-fashion-oxford-small-casual-men-mini-handbags-male-cross-body-shoulder-messenger-bags-for-men-purses-and-handbags",
  "turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care-1":
    "turmeric-face-moisturizing-cream-hydrating-skin-nourishing-glow-locking-anti-oxidant-soothing-daily-facial-lotion-self-care",
  "mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme-1":
    "mens-wallet-leather-men-wallets-premium-product-artificial-leather-wallets-for-man-short-black-walet-portefeuille-homme",
  "facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home-1":
    "facial-mister-moisturizing-handheld-mist-sprayer-small-skin-care-tools-portable-humidifier-steamer-for-outdoor-makeup-home",
  "turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m-1":
    "turmeric-essential-oil-facial-body-massage-oil-moisturizing-diffuser-aromatherapy-brightening-smoothing-body-face-skin-care-200m",
  "causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women-1":
    "causal-simple-travel-school-bags-portable-large-capacity-waterproof-school-books-pencil-case-water-bottle-bookbag-for-men-women",
  "4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush-1":
    "4-colors-blush-powder-face-makeup-sweet-warm-colors-matte-cheek-powder-facial-beauty-cosmetic-makeup-blush",
  "hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair-1":
    "hair-trimmer-oil-clippers-oil-lubricating-oils-rust-prevention-reduces-friction-barber-oil-for-clippers-shaver-oil-hair",
  "body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing-1":
    "body-exfoliator-towel-bath-scrubber-exfoliating-scrub-back-wash-cloth-soft-shower-sponge-bathroom-accessory-full-body-cleansing",
  "blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright-1":
    "blush-palette-makeup-blush-palette-makeup-multi-colored-bright-light-long-lasting-natural-glow-complexion-face-blushes-bright",
};

function hasCanonicalRel(link: HTMLLinkElement): boolean {
  return String(link.getAttribute("rel") || "")
    .split(/\s+/)
    .some((value) => value.toLowerCase() === "canonical");
}

function getCanonicalLinks(document: Document): HTMLLinkElement[] {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel]")).filter(hasCanonicalRel);
}

function pathnameFromInput(input: string | null | undefined): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return "/";
  }

  try {
    return new URL(raw, `${CANONICAL_ORIGIN}/`).pathname || "/";
  } catch {
    return raw.split(/[?#]/, 1)[0] || "/";
  }
}

export function normalizeCanonicalPath(input: string | null | undefined): string {
  const rawPathname = pathnameFromInput(input);
  const withLeadingSlash = rawPathname.startsWith("/") ? rawPathname : `/${rawPathname}`;
  const normalizedPathname = withLeadingSlash.replace(/\/{2,}/g, "/");
  const segments = normalizedPathname.split("/").filter(Boolean);
  const hasLocalePrefix = Boolean(segments[0] && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[0]));
  const routeOffset = hasLocalePrefix ? 1 : 0;
  const routeType = segments[routeOffset]?.toLowerCase();

  if ((routeType === "product" || routeType === "products") && segments[routeOffset + 1]) {
    const requestedHandle = segments[routeOffset + 1];
    const canonicalHandle = PRODUCT_CANONICAL_ALIASES[requestedHandle] || requestedHandle;
    return `/products/${canonicalHandle}`;
  }

  if (routeType === "collections" && segments[routeOffset + 1]) {
    // Older nested links used /collections/:parent/:child. Each child is a
    // real Shopify collection, so its direct handle is the canonical route.
    const requestedHandle = segments[routeOffset + 2] || segments[routeOffset + 1];
    const collectionHandle = COLLECTION_CANONICAL_ALIASES[requestedHandle] || requestedHandle;
    return `/collections/${collectionHandle}`;
  }

  if (!segments.length) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

export function buildCanonicalUrl(input: string | null | undefined): string {
  try {
    const rawUrl = new URL(String(input || ""), `${CANONICAL_ORIGIN}/`);
    if (rawUrl.pathname === "/pages/resources" && rawUrl.searchParams.get("resource") === "guide") {
      const handle = String(rawUrl.searchParams.get("handle") || "").trim().toLowerCase();
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(handle)) {
        return `${CANONICAL_ORIGIN}/pages/resources?resource=guide&handle=${encodeURIComponent(handle)}`;
      }
    }
  } catch {
    // Fall through to the standard path-only canonical normalization.
  }

  const pathname = normalizeCanonicalPath(input);
  return pathname === "/" ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${pathname}`;
}

function applyCanonicalState(document: Document, state: CanonicalDocumentState, href: string): void {
  if (!state.element.isConnected) {
    const existing = getCanonicalLinks(document)[0];
    state.element = existing || document.createElement("link");
    if (!existing) {
      document.head.appendChild(state.element);
    }
  }

  for (const duplicate of getCanonicalLinks(document)) {
    if (duplicate !== state.element) {
      duplicate.remove();
    }
  }

  state.element.setAttribute("rel", "canonical");
  state.element.setAttribute("href", href);
}

export function updateCanonicalLink(
  document: Document,
  input: string | null | undefined,
): Cleanup {
  const href = buildCanonicalUrl(input);
  let state = canonicalDocumentStates.get(document);

  if (!state) {
    const canonicalLinks = getCanonicalLinks(document);
    const existing = canonicalLinks[0];
    const element = existing || document.createElement("link");

    state = {
      element,
      created: !existing,
      originalHref: existing?.getAttribute("href") ?? null,
      originalRel: existing?.getAttribute("rel") ?? null,
      entries: new Map(),
    };

    if (!existing) {
      document.head.appendChild(element);
    }

    canonicalDocumentStates.set(document, state);
  }

  const entry = Symbol("canonical-entry");
  state.entries.set(entry, href);
  applyCanonicalState(document, state, href);

  return () => {
    const currentState = canonicalDocumentStates.get(document);
    if (currentState !== state) {
      return;
    }

    state.entries.delete(entry);
    const remainingHref = Array.from(state.entries.values()).at(-1);
    if (remainingHref) {
      applyCanonicalState(document, state, remainingHref);
      return;
    }

    if (state.created) {
      state.element.remove();
    } else {
      if (state.originalRel == null) {
        state.element.removeAttribute("rel");
      } else {
        state.element.setAttribute("rel", state.originalRel);
      }

      if (state.originalHref == null) {
        state.element.removeAttribute("href");
      } else {
        state.element.setAttribute("href", state.originalHref);
      }
    }

    canonicalDocumentStates.delete(document);
  };
}
