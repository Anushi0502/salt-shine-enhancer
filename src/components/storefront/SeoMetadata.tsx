import { useEffect } from "react";
import { buildCanonicalUrl, updateCanonicalLink } from "@/lib/canonical-url";

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

function toAbsoluteUrl(value: string): string {
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function isForcedNoIndexRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const first = String(segments[0] || "").toLowerCase();
  const second = String(segments[1] || "").toLowerCase();
  const hasLocalePrefix = /^[a-z]{2}(?:-[a-z]{2})?$/.test(first);
  const routeType = hasLocalePrefix ? second : first;
  const reviewSegment = String(segments[hasLocalePrefix ? 3 : 2] || "").toLowerCase();

  // Review pages are a thin utility view of the PDP. Keep them available to
  // shoppers, but do not let an empty/filtered review state compete with the
  // product URL in search.
  return (routeType === "product" || routeType === "products") && reviewSegment === "reviews";
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
  ogType,
  noIndex = false,
  structuredData = [],
  scope = "page",
}: SeoMetadataProps) => {
  const routeNoIndex = typeof window !== "undefined" ? isForcedNoIndexRoute(window.location.pathname) : false;
  const effectiveNoIndex = noIndex || routeNoIndex;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const cleanups: Cleanup[] = [];
    const previousTitle = document.title;
    const absoluteImage = image ? toAbsoluteUrl(image) : "";
    const managesRouteMetadata = Boolean(title || description || canonicalPath || image || effectiveNoIndex);
    const resolvedOgType = managesRouteMetadata ? ogType || "website" : null;

    if (title) {
      document.title = title;
      cleanups.push(() => {
        document.title = previousTitle;
      });
    }

    if (description) {
      cleanups.push(updateMetaTag(document, "name", "description", description, scope));
    }

    const absoluteCanonical = canonicalPath ? buildCanonicalUrl(canonicalPath) : "";
    if (absoluteCanonical) {
      cleanups.push(updateCanonicalLink(document, canonicalPath));
      cleanups.push(updateMetaTag(document, "property", "og:url", absoluteCanonical, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:url", absoluteCanonical, scope));
    }

    if (title) {
      cleanups.push(updateMetaTag(document, "property", "og:title", title, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:title", title, scope));
    }

    if (description) {
      cleanups.push(updateMetaTag(document, "property", "og:description", description, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:description", description, scope));
    }

    if (resolvedOgType) {
      cleanups.push(updateMetaTag(document, "property", "og:type", resolvedOgType, scope));
    }

    if (absoluteImage && managesRouteMetadata) {
      cleanups.push(updateMetaTag(document, "property", "og:image", absoluteImage, scope));
      cleanups.push(updateMetaTag(document, "property", "og:image:secure_url", absoluteImage, scope));
      cleanups.push(updateMetaTag(document, "property", "og:image:alt", title || "SALT Online Store", scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:image", absoluteImage, scope));
      cleanups.push(updateMetaTag(document, "name", "twitter:image:alt", title || "SALT Online Store", scope));
    }

    if (managesRouteMetadata) {
      cleanups.push(updateMetaTag(document, "name", "twitter:card", absoluteImage ? "summary_large_image" : "summary", scope));

      const robotsContent = effectiveNoIndex
        ? "noindex,follow"
        : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
      cleanups.push(updateMetaTag(document, "name", "robots", robotsContent, scope));
      cleanups.push(updateMetaTag(document, "name", "googlebot", robotsContent, scope));
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
  }, [canonicalPath, description, effectiveNoIndex, image, ogType, scope, structuredData, title]);

  return null;
};

export default SeoMetadata;
