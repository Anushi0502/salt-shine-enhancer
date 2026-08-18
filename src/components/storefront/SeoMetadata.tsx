import { useEffect } from "react";

type StructuredDataValue = Record<string, unknown> | null | undefined;

type SeoMetadataProps = {
  title?: string | null;
  description?: string | null;
  canonicalPath?: string | null;
  image?: string | null;
  ogType?: string | null;
  noIndex?: boolean;
  structuredData?: StructuredDataValue[];
  scope?: string;
};

type Cleanup = () => void;

const META_TAGS = [
  { attr: "name", value: "description" },
  { attr: "name", value: "robots" },
  { attr: "property", value: "og:title" },
  { attr: "property", value: "og:description" },
  { attr: "property", value: "og:type" },
  { attr: "property", value: "og:url" },
  { attr: "property", value: "og:image" },
  { attr: "name", value: "twitter:card" },
  { attr: "name", value: "twitter:title" },
  { attr: "name", value: "twitter:description" },
  { attr: "name", value: "twitter:image" },
] as const;

function escapeSelectorValue(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePath(path: string | null | undefined): string {
  const raw = String(path || "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  return `/${raw}`;
}

function getAbsoluteUrl(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (typeof window === "undefined") {
    return normalized;
  }

  return `${window.location.origin}${normalized}`;
}

function updateMetaTag(
  document: Document,
  attr: "name" | "property",
  value: string,
  content: string,
  scope: string,
): Cleanup {
  const selector = `meta[${attr}="${escapeSelectorValue(value)}"][data-seo-scope="${escapeSelectorValue(scope)}"]`;
  const existing =
    document.head.querySelector<HTMLMetaElement>(selector) ||
    document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${escapeSelectorValue(value)}"]`);

  if (existing) {
    const previousContent = existing.getAttribute("content");
    existing.setAttribute("content", content);

    return () => {
      if (previousContent == null) {
        existing.removeAttribute("content");
      } else {
        existing.setAttribute("content", previousContent);
      }
    };
  }

  const element = document.createElement("meta");
  element.setAttribute(attr, value);
  element.setAttribute("content", content);
  element.setAttribute("data-seo-scope", scope);
  document.head.appendChild(element);

  return () => {
    element.remove();
  };
}

function updateLinkTag(
  document: Document,
  rel: string,
  href: string,
  scope: string,
): Cleanup {
  const selector = `link[rel="${escapeSelectorValue(rel)}"][data-seo-scope="${escapeSelectorValue(scope)}"]`;
  const existing =
    document.head.querySelector<HTMLLinkElement>(selector) ||
    document.head.querySelector<HTMLLinkElement>(`link[rel="${escapeSelectorValue(rel)}"]`);

  if (existing) {
    const previousHref = existing.getAttribute("href");
    existing.setAttribute("href", href);

    return () => {
      if (previousHref == null) {
        existing.removeAttribute("href");
      } else {
        existing.setAttribute("href", previousHref);
      }
    };
  }

  const element = document.createElement("link");
  element.setAttribute("rel", rel);
  element.setAttribute("href", href);
  element.setAttribute("data-seo-scope", scope);
  document.head.appendChild(element);

  return () => {
    element.remove();
  };
}

function updateStructuredData(
  document: Document,
  payloads: StructuredDataValue[],
  scope: string,
): Cleanup {
  const existingScripts = Array.from(
    document.head.querySelectorAll<HTMLScriptElement>(
      `script[type="application/ld+json"][data-seo-scope="${escapeSelectorValue(scope)}"]`,
    ),
  );
  existingScripts.forEach((script) => script.remove());

  const payloadTypes = new Set(
    payloads.flatMap((payload) => {
      const type = payload && typeof payload === "object" ? payload["@type"] : null;
      return Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
    }),
  );
  if (payloadTypes.size) {
    Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))
      .filter((script) => script.getAttribute("data-seo-scope") !== scope)
      .forEach((script) => {
        try {
          const parsed = JSON.parse(script.textContent || "") as Record<string, unknown>;
          const type = parsed["@type"];
          const existingTypes = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
          if (existingTypes.some((entry) => payloadTypes.has(entry))) {
            script.remove();
          }
        } catch {
          // Leave third-party JSON-LD untouched when it is not valid JSON.
        }
      });
  }

  const scripts = payloads.map((payload, index) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-scope", scope);
    script.setAttribute("data-seo-index", String(index));
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
    return script;
  });

  return () => {
    scripts.forEach((script) => script.remove());
  };
}

const SeoMetadata = ({
  title,
  description,
  canonicalPath,
  image,
  ogType = "website",
  noIndex = false,
  structuredData = [],
  scope = "page",
}: SeoMetadataProps) => {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const cleanups: Cleanup[] = [];
    const previousTitle = document.title;

    if (title) {
      document.title = title;
      cleanups.push(() => {
        document.title = previousTitle;
      });
    }

    if (description) {
      cleanups.push(updateMetaTag(document, "name", "description", description, scope));
    }

    const absoluteCanonical = getAbsoluteUrl(canonicalPath);
    if (absoluteCanonical) {
      cleanups.push(updateLinkTag(document, "canonical", absoluteCanonical, scope));
      cleanups.push(updateMetaTag(document, "property", "og:url", absoluteCanonical, scope));
    }

    if (title) {
      cleanups.push(updateMetaTag(document, "property", "og:title", title, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:title", title, scope));
    }

    if (description) {
      cleanups.push(updateMetaTag(document, "property", "og:description", description, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:description", description, scope));
    }

    if (ogType) {
      cleanups.push(updateMetaTag(document, "property", "og:type", ogType, scope));
    }

    if (image) {
      cleanups.push(updateMetaTag(document, "property", "og:image", image, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:image", image, scope));
    }

    cleanups.push(updateMetaTag(document, "name", "twitter:card", image ? "summary_large_image" : "summary", scope));

    if (noIndex) {
      cleanups.push(updateMetaTag(document, "name", "robots", "noindex,follow", scope));
    }

    const structuredPayloads = structuredData.filter(Boolean);
    if (structuredPayloads.length) {
      cleanups.push(updateStructuredData(document, structuredPayloads, scope));
    }

    return () => {
      for (const cleanup of cleanups.reverse()) {
        cleanup();
      }
    };
  }, [canonicalPath, description, image, noIndex, ogType, scope, structuredData, title]);

  return null;
};

export default SeoMetadata;
