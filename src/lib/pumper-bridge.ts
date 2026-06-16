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
    cartSyncTimer: 0,
    quantityObserver: null as MutationObserver | null,
    quantityObserverRoot: null as Element | null,
  };

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const normalizeText = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

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

    const nextValue = String(Math.max(1, Math.floor(quantity || 1)));
    if (hidden.value === nextValue) return;

    hidden.value = nextValue;
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const getPumperRadioInputs = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('#pumper_bundle_svelte input[type="radio"][name="cb"]'));

  const getPumperRadioLabel = (input: HTMLInputElement | null) => {
    if (!input) return null;

    const selectors: string[] = [];
    const value = normalizeText(input.value);
    if (value) selectors.push(`#pumper__label_${value}`);
    if (input.id) selectors.push(`label[for="${input.id.replaceAll('"', '\\"')}"]`);

    for (const selector of selectors) {
      const label = document.querySelector(selector);
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

    const target = Math.max(1, Math.floor(quantity || 1));
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

  const formatMoney = (value: unknown) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

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

  const getCurrentProductHandle = () => {
    const match = window.location.pathname.match(/\/products?\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const getReactFiberRoot = () => {
    const root = document.getElementById("salt-app-root") || document.getElementById("root");
    if (!root) return null;

    const fiberKey = Object.keys(root).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$"),
    );
    return fiberKey ? (root as unknown as Record<string, unknown>)[fiberKey] : null;
  };

  const findFiber = (node: unknown, predicate: (fiber: any) => boolean) => {
    const seen = new Set<object>();

    const visit = (current: any): any => {
      if (!current || seen.has(current)) return null;
      seen.add(current);

      if (predicate(current)) return current;

      const child = visit(current.child);
      if (child) return child;

      return visit(current.sibling);
    };

    return visit(node);
  };

  const isCartApi = (value: unknown) =>
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
    return providerFiber?.memoizedProps?.value || null;
  };

  const getBundlePricingSnapshot = () => {
    const quantity = getPumperQuantity();
    const total = parseMoney(getSelectedPumperTotal());
    const handle = getCurrentProductHandle();

    if (!isPositiveNumber(quantity) || !isPositiveNumber(total) || !handle) return null;

    return {
      handle: normalizeHandle(handle),
      quantity,
      total,
      unitPrice: total / quantity,
    };
  };

  const applyBundlePriceToCart = (snapshot: { handle: string; unitPrice: number }) => {
    const api = getCartApi();
    if (!api || typeof api.replaceItems !== "function" || !Array.isArray(api.items)) return false;

    const itemIndex = api.items.findIndex((item: { handle?: string }) => normalizeHandle(item.handle) === snapshot.handle);
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

  const queueCartBundlePriceSync = (snapshot: { handle: string; unitPrice: number } | null) => {
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
    const target = Math.max(1, Math.floor(quantity || 1));
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
    await syncThemeFromPumper();
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
    new MutationObserver(queueBoot).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener("DOMContentLoaded", queueBoot, { once: true });
  queueBoot();
}
