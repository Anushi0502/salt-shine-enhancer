const DEFAULT_JUDGEME_API_BASE_URL = "https://api.judge.me/api/v1";

function normalizeBaseUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function isDirectJudgeMeApi(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname.toLowerCase() === "api.judge.me" && /^\/api\/v1(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

export function getJudgeMeProxyBaseUrl(): string {
  return (
    normalizeBaseUrl(String(import.meta.env.VITE_JUDGEME_PROXY_BASE_URL || "")) ||
    DEFAULT_JUDGEME_API_BASE_URL
  );
}

export function buildJudgeMeProxyUrl(pathname: string, searchParams?: URLSearchParams): string {
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  const baseUrl = getJudgeMeProxyBaseUrl().replace(/\/+$/, "");
  const route = isDirectJudgeMeApi(baseUrl) ? cleanPath : `api/judgeme/${cleanPath}`;
  const url = new URL(`${baseUrl}/${route}`);

  if (searchParams) {
    searchParams.forEach((value, key) => {
      if (key === "t") {
        return;
      }

      url.searchParams.append(key, value);
    });
  }

  return url.toString();
}
