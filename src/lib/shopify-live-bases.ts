function normalizeBaseUrl(input: string | null | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toProxyBase(origin: string | null | undefined): string | null {
  const normalized = normalizeBaseUrl(origin);
  return normalized ? `${normalized}/__salt_shopify` : null;
}

export interface BuildLiveShopifyBaseCandidatesOptions {
  browserOrigin?: string | null;
  shopBaseOrigin: string;
  shopApiBase: string;
  native: boolean;
  localHost?: boolean;
}

export function buildLiveShopifyBaseCandidates({
  browserOrigin,
  shopBaseOrigin,
  shopApiBase,
  native,
  localHost = false,
}: BuildLiveShopifyBaseCandidatesOptions): string[] {
  const browserBase = normalizeBaseUrl(browserOrigin);
  const brandedBase = normalizeBaseUrl(shopBaseOrigin);
  const canonicalBase = normalizeBaseUrl(shopApiBase);
  const browserProxyBase = toProxyBase(browserOrigin);
  const brandedProxyBase = toProxyBase(shopBaseOrigin);
  const bases: string[] = [];

  if (native) {
    if (brandedProxyBase) {
      bases.push(brandedProxyBase);
    }

    if (canonicalBase) {
      bases.push(canonicalBase);
    }

    return uniqueValues(bases);
  }

  if (localHost && browserProxyBase) {
    bases.push(browserProxyBase);
  }

  if (brandedProxyBase && brandedProxyBase !== browserProxyBase) {
    bases.push(brandedProxyBase);
  }

  if (canonicalBase) {
    bases.push(canonicalBase);
  }

  if (browserBase && browserBase !== canonicalBase && browserBase !== brandedBase) {
    bases.push(browserBase);
  }

  return uniqueValues(bases);
}
