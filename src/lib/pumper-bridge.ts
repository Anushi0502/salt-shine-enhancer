import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";

export type BundlePricingSnapshot = {
  handle: string;
  variantId: number | null;
  unitPrice: number;
};

export function findBundleCartItemIndex(
  items: Array<{ handle?: string; shopifyVariantId?: number; id?: number }>,
  snapshot: BundlePricingSnapshot,
) {
  return items.findIndex((item: { handle?: string; shopifyVariantId?: number; id?: number }) => {
    const itemVariantId = Number(item.shopifyVariantId || item.id || 0);
    const snapshotVariantId = Number(snapshot.variantId || 0);

    if (Number.isFinite(snapshotVariantId) && snapshotVariantId > 0 && Number.isFinite(itemVariantId) && itemVariantId > 0) {
      return itemVariantId === snapshot.variantId;
    }

    return String(item.handle || "").trim().toLowerCase() === String(snapshot.handle || "").trim().toLowerCase();
  });
}

const normalizeWhitespaceText = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

export const formatMoneyValue = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const replaceFirstMoney = (text: string, amount: number) => {
  const formatted = formatMoneyValue(amount);
  if (!formatted) return text;

  return /\$\s*[\d,]+(?:\.\d+)?/.test(text) ? text.replace(/\$\s*[\d,]+(?:\.\d+)?/, formatted) : formatted;
};

export const collectLeafMatchingElements = (root: HTMLElement | null, predicate: (text: string) => boolean) => {
  if (!root) return [] as HTMLElement[];

  const candidates = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) =>
    predicate(normalizeWhitespaceText(element.textContent)),
  );

  return candidates.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)));
};

export const replaceMoneyInElement = (element: HTMLElement | null, amount: number) => {
  if (!element) return false;

  let changed = false;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const text = textNode.nodeValue || "";

    if (!/\$\s*[\d,]+(?:\.\d+)?/.test(text)) {
      continue;
    }

    const nextText = replaceFirstMoney(text, amount);
    if (nextText !== text) {
      textNode.nodeValue = nextText;
      changed = true;
      break;
    }
  }

  return changed;
};

export const replaceMoneyInElements = (elements: HTMLElement[], amount: number) => {
  elements.forEach((element) => {
    replaceMoneyInElement(element, amount);
  });
};

declare global {
  interface Window {
    __saltPumperBridgeInstalled?: boolean;
  }
}

export function installSaltPumperBridge(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (window.__saltPumperBridgeInstalled) {
    return;
  }

  window.__saltPumperBridgeInstalled = true;

  const state = {
    locked: false,
    bootQueued: false,
    themeSyncTimer: 0,
    pumperSyncTimer: 0,
    variantSyncTimer: 0,
    cartSyncTimer: 0,
    quantityObserver: null as MutationObserver | null,
    quantityObserverRoot: null as Element | null,
    pumperObserver: null as MutationObserver | null,
    pumperObserverRoot: null as Element | null,
    currentProductHandle: "",
    currentVariantId: null as number | null,
    currentVariantPrice: null as number | null,
    currentVariantComparePrice: null as number | null,
    appliedVariantHandle: "",
    appliedVariantId: null as number | null,
    appliedVariantPrice: null as number | null,
    appliedVariantComparePrice: null as number | null,
    bundlePriceBase: null as number | null,
    bundleCompareBase: null as number | null,
  };

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const normalizeText = normalizeWhitespaceText;

  const isPositiveNumber = (value: unknown) => Number.isFinite(value as number) && Number(value) > 0;

  const getProductAside = () => document.querySelector<HTMLElement>("aside.salt-panel-shell");

  const getPumperWidget = () => document.getElementById("svelte-bundle-widget");

  const getBuyNowButton = () => {
    const aside = getProductAside();
    if (!aside) return null;
    return (
      Array.from(aside.querySelectorAll<HTMLAnchorElement>("a")).find(
        (el) => normalizeText(el.textContent) === "Buy now",
      ) || null
    );
  };

  const getQuantityControls = () => {
    const aside = getProductAside();
    if (!aside) return null;

    const decrease = aside.querySelector<HTMLButtonElement>('button[aria-label="Decrease quantity"]');
    const increase = aside.querySelector<HTMLButtonElement>('button[aria-label="Increase quantity"]');

    if (!decrease || !increase) return null;

    const value = decrease.parentElement?.querySelector<HTMLSpanElement>("span");
    return value ? { decrease, increase, value } : null;
  };

  const getThemeQuantity = () => {
    const controls = getQuantityControls();
    const value = Number(controls?.value?.textContent?.trim() || "1");
    return isPositiveNumber(value) ? value : 1;
  };

  const setHiddenPumperQuantity = (quantity: number) => {
    const hidden = document.getElementById("pumper_custom_qty") as HTMLInputElement | null;
    if (!hidden) return;

    const nextValue = String(Math.max(getCurrentBundleMinimumQuantity(), Math.floor(quantity || 1)));
    if (hidden.value === nextValue) return;

    hidden.value = nextValue;
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const getPumperRadioInputs = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('#pumper_bundle_svelte input[type="radio"][name="cb"]'));

  const getPumperRadioLabel = (input: HTMLInputElement | null): HTMLElement | null => {
    if (!input) return null;

    const selectors: string[] = [];
    const value = normalizeText(input.value);
    if (value) selectors.push(`#pumper__label_${value}`);
    if (input.id) selectors.push(`label[for="${input.id.replaceAll('"', '\\"')}"]`);

    for (const selector of selectors) {
      const label = document.querySelector<HTMLElement>(selector);
      if (label) return label;
    }

    return input.closest("label") || input.parentElement || null;
  };

  const extractPumperQuantity = (text: unknown) => {
    const cleaned = normalizeText(text)
      .replace(/\$\s*[\d,.]+/g, " ")
      .replace(/\b\d+(?:\.\d+)?%/g, " ");

    const quantityMatch = cleaned.match(
      /\b(\d+)\b(?=[^\d]*(?:pair|pairs|pack|packs|bundle|bundles|set|sets|piece|pieces|pc|pcs|x)\b)/i,
    );
    if (quantityMatch) return Number(quantityMatch[1]);

    const fallbackMatch = cleaned.match(/\b(\d+)\b/);
    return fallbackMatch ? Number(fallbackMatch[1]) : 0;
  };

  const getPumperOptionQuantity = (radio: HTMLInputElement) => {
    const datasetQuantity = Number(
      radio?.dataset?.quantity ||
        radio?.dataset?.qty ||
        radio?.dataset?.bundleQuantity ||
        radio?.dataset?.minQuantity ||
        "0",
    );
    if (isPositiveNumber(datasetQuantity)) return datasetQuantity;

    const label = getPumperRadioLabel(radio);
    const labelQuantity = extractPumperQuantity(label?.textContent);
    if (isPositiveNumber(labelQuantity)) return labelQuantity;

    const valueQuantity = Number(radio?.value || "0");
    return isPositiveNumber(valueQuantity) ? valueQuantity : 0;
  };

  const getPumperOptions = () =>
    getPumperRadioInputs()
      .map((input, index) => ({
        input,
        index,
        quantity: getPumperOptionQuantity(input),
      }))
      .filter((option) => isPositiveNumber(option.quantity));

  const getPumperQuantity = () => {
    const checked = getPumperOptions().find((option) => option.input.checked);
    return checked?.quantity || 0;
  };

  const getSelectedPumperIndex = () => {
    const selected = getPumperOptions().find((option) => option.input.checked);
    return selected ? selected.index : -1;
  };

  const getSelectedPumperTotal = () => {
    const index = getSelectedPumperIndex();
    if (index < 0) return null;

    const totalNode = document.getElementById(`pumper_totalAmount_${index}`);
    const total = normalizeText(totalNode?.textContent);
    return total || null;
  };

  const getAvailablePumperQuantities = () =>
    Array.from(new Set(getPumperOptions().map((option) => option.quantity))).sort((a, b) => a - b);

  const getBestPumperQuantity = (quantity: number) => {
    const available = getAvailablePumperQuantities();
    if (!available.length) return 0;

    const target = Math.max(getCurrentBundleMinimumQuantity(), Math.floor(quantity || 1));
    let selected = available[0];

    for (const option of available) {
      if (target >= option) {
        selected = option;
      } else {
        break;
      }
    }

    return selected;
  };

  const getPumperOptionByQuantity = (quantity: number) =>
    getPumperOptions().find((option) => option.quantity === quantity) || null;

  const queueThemePumperSync = (delay = 0) => {
    window.clearTimeout(state.themeSyncTimer);
    state.themeSyncTimer = window.setTimeout(() => syncPumperFromTheme(), delay);
  };

  const observeQuantityChanges = () => {
    const aside = getProductAside();
    if (!aside) return false;

    if (state.quantityObserverRoot === aside) return true;

    if (state.quantityObserver) {
      state.quantityObserver.disconnect();
    }

    state.quantityObserverRoot = aside;
    state.quantityObserver = new MutationObserver(() => {
      if (state.locked) return;
      queueThemePumperSync(0);
    });

    state.quantityObserver.observe(aside, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return true;
  };

  const observePumperWidget = () => {
    const widget = getPumperWidget();
    if (!widget) {
      return false;
    }

    if (state.pumperObserverRoot === widget) {
      return true;
    }

    if (state.pumperObserver) {
      state.pumperObserver.disconnect();
    }

    state.pumperObserverRoot = widget;
    state.pumperObserver = new MutationObserver(() => {
      if (state.locked) return;
      queueVariantPricingSync(0);
      syncAddToCartLabels();
    });

    state.pumperObserver.observe(widget, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    return true;
  };

  const formatMoney = formatMoneyValue;

  const normalizeHandle = (value: unknown) => String(value || "").trim().toLowerCase();

  const parseMoney = (value: unknown) => {
    const cleaned = normalizeText(value).replace(/[^0-9,.-]/g, "");
    if (!cleaned) return null;

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
    const normalized =
      decimalSeparator === ","
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");

    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  };

  const approxEqual = (left: unknown, right: unknown, tolerance = 0.01) => {
    const a = Number(left);
    const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  };

  const getCurrentProductHandle = () => {
    const match = window.location.pathname.match(/\/products?\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const getCurrentBundleMinimumQuantity = () =>
    (() => {
      const asideQuantity = Number(getProductAside()?.dataset.saltMinimumQuantity || "");
      if (Number.isFinite(asideQuantity) && asideQuantity > 0) {
        return Math.max(1, Math.floor(asideQuantity));
      }

      return getMinimumProductQuantity(state.currentProductHandle || getCurrentProductHandle(), state.currentVariantPrice);
    })();

  const ensurePumperSoldOutStyle = () => {
    if (document.getElementById("salt-pumper-sold-out-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "salt-pumper-sold-out-style";
    style.textContent = `
      #pumper_bundle_svelte [data-salt-sold-out="true"] {
        cursor: not-allowed !important;
        opacity: 0.56 !important;
      }

      #pumper_bundle_svelte [data-salt-sold-out="true"] .pumper_template_9_block__cbmain--content--left__top [data-tier-title] {
        position: relative !important;
        color: transparent !important;
      }

      #pumper_bundle_svelte [data-salt-sold-out="true"] .pumper_template_9_block__cbmain--content--left__top [data-tier-title]::before {
        content: "Sold out";
        position: absolute;
        inset: 0;
        display: inline-flex;
        align-items: center;
        color: rgb(155, 28, 28);
        font-weight: 700;
      }

      #pumper_bundle_svelte [data-salt-sold-out="true"] [data-tier-subtitle],
      #pumper_bundle_svelte [data-salt-sold-out="true"] [data-tier-offer-subtitle],
      #pumper_bundle_svelte [data-salt-sold-out="true"] .pumper_totalAmount_wrapper,
      #pumper_bundle_svelte [data-salt-sold-out="true"] [id^="pumper_totalAmount_"],
      #pumper_bundle_svelte [data-salt-sold-out="true"] .tier-price__compare,
      #pumper_bundle_svelte [data-salt-sold-out="true"] .tier-price__each-unit-line {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  };

  type PumperPricingCard = {
    index: number;
    quantity: number;
    radio: HTMLInputElement;
    card: HTMLElement | null;
    priceNode: HTMLElement | null;
    compareNodes: HTMLElement[];
    saveNodes: HTMLElement[];
    eachNodes: HTMLElement[];
    currentPrice: number | null;
    currentComparePrice: number | null;
  };

  const getPumperPricingCards = (): PumperPricingCard[] =>
    getPumperOptions().map(({ input, index, quantity }) => {
      const card = getPumperRadioLabel(input);
      const priceNode = document.getElementById(`pumper_totalAmount_${index}`) as HTMLElement | null;
      const priceNodeText = normalizeText(priceNode?.textContent);

      const compareNodes = card
        ? Array.from(card.querySelectorAll<HTMLElement>("s, del")).filter((element) =>
            /\$\s*[\d,]+(?:\.\d+)?/.test(normalizeText(element.textContent)),
          )
        : [];

      const saveNodes = collectLeafMatchingElements(card, (text) => /^save\b/i.test(text) && /\$\s*[\d,]+(?:\.\d+)?/.test(text));

      const eachNodes = collectLeafMatchingElements(card, (text) => /\/\s*each\b/i.test(text) && /\$\s*[\d,]+(?:\.\d+)?/.test(text));

      return {
        index,
        quantity,
        radio: input,
        card,
        priceNode,
        compareNodes,
        saveNodes,
        eachNodes,
        currentPrice: parseMoney(priceNodeText),
        currentComparePrice: parseMoney(compareNodes[0]?.textContent),
      };
    });

  const syncBundleMinimumQuantityState = (cards: PumperPricingCard[]) => {
    const minimumQuantity = getCurrentBundleMinimumQuantity();
    const restricted = minimumQuantity > 1;

    if (restricted) {
      ensurePumperSoldOutStyle();
    }

    cards.forEach((card) => {
      const soldOut = restricted && card.quantity < minimumQuantity;
      const cardElement = card.card;
      if (cardElement) {
        if (soldOut) {
          cardElement.setAttribute("data-salt-sold-out", "true");
        } else {
          cardElement.removeAttribute("data-salt-sold-out");
        }
      }

      card.radio.disabled = soldOut;
      card.radio.setAttribute("aria-disabled", soldOut ? "true" : "false");
    });
  };

  const getReactFiberRoot = () => {
    const root = document.getElementById("salt-app-root") || document.getElementById("root");
    if (!root) return null;

    const fiberKey = Object.keys(root).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$"),
    );
    return fiberKey ? (root as unknown as Record<string, unknown>)[fiberKey] : null;
  };

  type ReactFiberNode = {
    child?: unknown;
    sibling?: unknown;
    memoizedProps?: { value?: unknown };
  };

  const findFiber = (node: unknown, predicate: (fiber: ReactFiberNode) => boolean) => {
    const seen = new Set<object>();

    const visit = (current: unknown): ReactFiberNode | null => {
      if (!current || typeof current !== "object") return null;
      const fiber = current as ReactFiberNode;
      if (seen.has(fiber)) return null;
      seen.add(fiber);

      if (predicate(fiber)) return fiber;

      const child = visit(fiber.child);
      if (child) return child;

      return visit(fiber.sibling);
    };

    return visit(node);
  };

  type CartApi = {
    items: unknown[];
    replaceItems: (items: unknown[]) => void;
  };

  const isCartApi = (value: unknown): value is CartApi =>
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown[] }).items) &&
    typeof (value as { replaceItems?: unknown }).replaceItems === "function" &&
    typeof (value as { addItem?: unknown }).addItem === "function" &&
    typeof (value as { updateQuantity?: unknown }).updateQuantity === "function" &&
    typeof (value as { openCartDrawer?: unknown }).openCartDrawer === "function" &&
    typeof (value as { closeCartDrawer?: unknown }).closeCartDrawer === "function";

  const getCartApi = () => {
    const rootFiber = getReactFiberRoot();
    if (!rootFiber) return null;

    const providerFiber = findFiber(rootFiber, (fiber) => isCartApi(fiber.memoizedProps?.value));
    const value = providerFiber?.memoizedProps?.value;
    return isCartApi(value) ? value : null;
  };

  const getBundlePricingSnapshot = () => {
    const quantity = getPumperQuantity();
    const total = parseMoney(getSelectedPumperTotal());
    const handle = getCurrentProductHandle();
    const variantId = Number(state.currentVariantId || 0);

    if (!isPositiveNumber(quantity) || !isPositiveNumber(total) || !handle) return null;

    return {
      handle: normalizeHandle(handle),
      variantId: isPositiveNumber(variantId) ? variantId : null,
      quantity,
      total,
      unitPrice: total / quantity,
    };
  };

  const syncPumperPricingFromVariant = () => {
    const handle = normalizeHandle(state.currentProductHandle || getCurrentProductHandle());
    const cards = getPumperPricingCards();
    if (!handle || !cards.length) return false;

    syncBundleMinimumQuantityState(cards);

    const variantPrice = Number(state.currentVariantPrice || 0);
    if (!isPositiveNumber(variantPrice)) return false;

    const firstCard = cards.find((card) => isPositiveNumber(card.currentPrice)) || cards[0];
    if (!firstCard || !isPositiveNumber(firstCard.currentPrice)) return false;

    const firstComparePrice = isPositiveNumber(firstCard.currentComparePrice) ? firstCard.currentComparePrice : null;

    if (!isPositiveNumber(state.bundlePriceBase) || !approxEqual(state.bundlePriceBase, firstCard.currentPrice)) {
      state.bundlePriceBase = firstCard.currentPrice;
    }

    if (isPositiveNumber(firstComparePrice)) {
      if (!isPositiveNumber(state.bundleCompareBase) || !approxEqual(state.bundleCompareBase, firstComparePrice)) {
        state.bundleCompareBase = firstComparePrice;
      }
    } else {
      state.bundleCompareBase = null;
    }

    const priceBase = Number(state.bundlePriceBase || 0);
    if (!isPositiveNumber(priceBase)) return false;

    const compareBase = Number(state.bundleCompareBase || 0);
    const priceScale = variantPrice / priceBase;
    const compareScale = isPositiveNumber(state.currentVariantComparePrice) && isPositiveNumber(compareBase)
      ? Number(state.currentVariantComparePrice) / compareBase
      : priceScale;

    const pricingChanged =
      !approxEqual(state.appliedVariantPrice, variantPrice) ||
      !approxEqual(state.appliedVariantComparePrice, state.currentVariantComparePrice);

    if (!pricingChanged && approxEqual(priceScale, 1) && approxEqual(compareScale, 1)) {
      syncAddToCartLabels();
      return true;
    }

    cards.forEach((card) => {
      const priceNode = card.priceNode;
      const currentPrice = Number(card.currentPrice || 0);
      const nextPrice = currentPrice * priceScale;
      const nextPriceText = formatMoney(nextPrice);

      if (priceNode && nextPriceText) {
        replaceMoneyInElement(priceNode, nextPrice);
      }

      const compareNode = card.compareNodes[0] || null;
      const currentComparePrice = Number(card.currentComparePrice || 0);
      const nextCompare = isPositiveNumber(currentComparePrice) ? currentComparePrice * compareScale : 0;
      const nextCompareText = isPositiveNumber(nextCompare) ? formatMoney(nextCompare) : null;

      if (compareNode && nextCompareText) {
        replaceMoneyInElement(compareNode, nextCompare);
      }

      const saveText = isPositiveNumber(nextCompare) ? nextCompare - nextPrice : 0;
      if (card.saveNodes.length && isPositiveNumber(saveText)) {
        replaceMoneyInElements(card.saveNodes, saveText);
      }

      if (card.eachNodes.length && isPositiveNumber(card.quantity)) {
        const eachPrice = nextPrice / card.quantity;
        const eachText = formatMoney(eachPrice);
        if (eachText) {
          replaceMoneyInElements(card.eachNodes, eachPrice);
        }
      }
    });

    state.bundlePriceBase = variantPrice;
    state.bundleCompareBase = isPositiveNumber(state.currentVariantComparePrice)
      ? Number(state.currentVariantComparePrice)
      : state.bundleCompareBase;
    state.appliedVariantHandle = handle;
    state.appliedVariantPrice = variantPrice;
    state.appliedVariantComparePrice = isPositiveNumber(state.currentVariantComparePrice)
      ? Number(state.currentVariantComparePrice)
      : null;

    syncAddToCartLabels();
    return true;
  };

  const queueVariantPricingSync = (delay = 0, attempt = 0) => {
    window.clearTimeout(state.variantSyncTimer);
    state.variantSyncTimer = window.setTimeout(() => {
      const synced = syncPumperPricingFromVariant();
      if (!synced && attempt < 20 && !state.locked) {
        queueVariantPricingSync(Math.min(400, 80 + attempt * 40), attempt + 1);
      }
    }, delay);
  };

  const applyBundlePriceToCart = (snapshot: BundlePricingSnapshot) => {
    const api = getCartApi();
    if (!api || typeof api.replaceItems !== "function" || !Array.isArray(api.items)) return false;

    const itemIndex = findBundleCartItemIndex(api.items, snapshot);
    if (itemIndex < 0) return false;

    const currentItem = api.items[itemIndex] as { unitPrice?: number };
    if (Math.abs(Number(currentItem.unitPrice || 0) - snapshot.unitPrice) < 0.001) {
      return true;
    }

    const nextItems = api.items.map((item: unknown, index: number) =>
      index === itemIndex ? { ...(item as Record<string, unknown>), unitPrice: snapshot.unitPrice } : item,
    );
    api.replaceItems(nextItems);
    return true;
  };

  const queueCartBundlePriceSync = (snapshot: BundlePricingSnapshot | null) => {
    if (!snapshot) return;

    window.clearTimeout(state.cartSyncTimer);
    const startedAt = Date.now();

    const run = () => {
      if (applyBundlePriceToCart(snapshot)) return;
      if (Date.now() - startedAt >= 2000) return;

      state.cartSyncTimer = window.setTimeout(run, 100);
    };

    state.cartSyncTimer = window.setTimeout(run, 0);
  };

  const clickThemeQuantityButton = async (direction: "increase" | "decrease") => {
    const controls = getQuantityControls();
    if (!controls) return false;

    controls[direction].click();
    await wait(120);
    return true;
  };

  const setThemeQuantity = async (quantity: number) => {
    const target = Math.max(getCurrentBundleMinimumQuantity(), Math.floor(quantity || 1));
    const controls = getQuantityControls();
    if (!controls) return;

    if (getThemeQuantity() === target) {
      setHiddenPumperQuantity(target);
      return;
    }

    state.locked = true;
    try {
      for (let step = 0; step < 10; step += 1) {
        const current = getThemeQuantity();
        if (current === target) break;

        await clickThemeQuantityButton(current < target ? "increase" : "decrease");
      }
    } finally {
      setHiddenPumperQuantity(target);
      await wait(120);
      state.locked = false;
    }
  };

  const setPumperQuantity = (quantity: number) => {
    const target = getBestPumperQuantity(quantity);
    if (!target) {
      setHiddenPumperQuantity(quantity);
      return;
    }

    const option = getPumperOptionByQuantity(target);
    const radio = option?.input || null;
    if (!radio || radio.checked) {
      setHiddenPumperQuantity(target);
      syncAddToCartLabels();
      return;
    }

    state.locked = true;
    try {
      radio.click();

      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("input", { bubbles: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }

      setHiddenPumperQuantity(target);
      syncAddToCartLabels();
    } finally {
      window.setTimeout(() => {
        state.locked = false;
      }, 250);
    }
  };

  const getAddToCartButtons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button.salt-primary-cta")).filter((button) =>
      /add to cart/i.test(normalizeText(button.textContent)),
    );

  const getPrimaryAddToCartButton = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;

    const button = target.closest("button.salt-primary-cta");
    if (!button || !getProductAside()?.contains(button)) return null;

    return /add to cart/i.test(normalizeText(button.textContent)) ? (button as HTMLButtonElement) : null;
  };

  const setButtonLabel = (button: HTMLButtonElement, label: string) => {
    const textNode = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);

    if (textNode) {
      if (textNode.nodeValue !== label) textNode.nodeValue = label;
    } else {
      button.appendChild(document.createTextNode(label));
    }

    button.dataset.saltBundleLabel = label;
    button.setAttribute("aria-label", label);
  };

  const syncAddToCartLabels = () => {
    const total = parseMoney(getSelectedPumperTotal());
    const bundleQuantity = getPumperQuantity();
    const quantity = getThemeQuantity();
    if (!isPositiveNumber(total) || !isPositiveNumber(bundleQuantity) || !isPositiveNumber(quantity)) return;

    const labelTotal = (total / bundleQuantity) * quantity;
    const labelAmount = formatMoney(labelTotal);
    if (!labelAmount) return;

    const label = `Add to cart - ${labelAmount}`;
    getAddToCartButtons().forEach((button) => setButtonLabel(button, label));
  };

  const syncThemeFromPumper = async () => {
    if (state.locked) return;

    const quantity = getPumperQuantity();
    if (quantity > 0) {
      await setThemeQuantity(quantity);
      syncPumperFromTheme();
    }

    syncAddToCartLabels();
  };

  const syncPumperFromTheme = () => {
    if (state.locked) return;

    const quantity = getThemeQuantity();
    const target = getBestPumperQuantity(quantity);
    if (target > 0) {
      const current = getPumperQuantity();
      if (current !== target) {
        window.clearTimeout(state.pumperSyncTimer);
        state.pumperSyncTimer = window.setTimeout(() => setPumperQuantity(target), 0);
      } else {
        setHiddenPumperQuantity(target);
        syncAddToCartLabels();
      }
      return;
    }

    setHiddenPumperQuantity(quantity);
    syncAddToCartLabels();
  };

  const placeWidgetAboveCheckout = () => {
    const widget = getPumperWidget();
    const buyNow = getBuyNowButton();
    const aside = getProductAside();
    if (!widget || !buyNow || !aside) return;

    if (widget.nextElementSibling === buyNow) return;
    aside.insertBefore(widget, buyNow);
  };

  const boot = async () => {
    placeWidgetAboveCheckout();
    observeQuantityChanges();
    observePumperWidget();
    await syncThemeFromPumper();
    queueVariantPricingSync(0);
    syncAddToCartLabels();
  };

  const queueBoot = () => {
    if (state.bootQueued) return;

    state.bootQueued = true;
    let settled = false;

    const run = () => {
      if (settled) return;

      settled = true;
      state.bootQueued = false;
      void boot();
    };

    window.requestAnimationFrame(run);
    window.setTimeout(run, 100);
  };

  document.addEventListener(
    "change",
    (event) => {
      if (state.locked) return;

      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "cb") {
        window.clearTimeout(state.themeSyncTimer);
        state.themeSyncTimer = window.setTimeout(() => syncThemeFromPumper(), 0);
      }
    },
    true,
  );

  window.addEventListener(
    "salt:product-variant-change",
    (event) => {
      const detail = (event as CustomEvent<{
        handle?: string;
        variantId?: number;
        price?: number;
        compareAtPrice?: number | null;
      }>).detail;

      const handle = normalizeHandle(detail?.handle || getCurrentProductHandle());
      if (!handle) return;

      state.currentProductHandle = handle;
      state.currentVariantId = isPositiveNumber(detail?.variantId) ? Number(detail?.variantId) : null;
      state.currentVariantPrice = Number(detail?.price || 0);
      state.currentVariantComparePrice = isPositiveNumber(detail?.compareAtPrice)
        ? Number(detail?.compareAtPrice)
        : null;

      if (state.appliedVariantHandle && state.appliedVariantHandle !== handle) {
        state.bundlePriceBase = null;
        state.bundleCompareBase = null;
        state.appliedVariantHandle = "";
        state.appliedVariantId = null;
        state.appliedVariantPrice = null;
        state.appliedVariantComparePrice = null;
      }

      queueVariantPricingSync(0);
    },
  );

  document.addEventListener(
    "click",
    (event) => {
      if (state.locked) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest('button[aria-label="Increase quantity"]') ||
        target.closest('button[aria-label="Decrease quantity"]')
      ) {
        queueThemePumperSync(220);
      }

      const addToCartButton = getPrimaryAddToCartButton(target);
      if (addToCartButton) {
        queueCartBundlePriceSync(getBundlePricingSnapshot());
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      if (state.locked) return;

      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "cb") {
        window.clearTimeout(state.themeSyncTimer);
        state.themeSyncTimer = window.setTimeout(() => syncThemeFromPumper(), 0);
      }
    },
    true,
  );

  if (document.body) {
    new MutationObserver(() => {
      observePumperWidget();
      queueBoot();
    }).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener("DOMContentLoaded", queueBoot, { once: true });
  queueBoot();
}
