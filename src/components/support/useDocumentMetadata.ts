import { useEffect } from "react";

const metaDescriptionSelector = 'meta[name="description"]';
const canonicalSelector = 'link[rel="canonical"]';

export function useDocumentMetadata(
  title: string,
  description?: string,
  options: { canonicalPath?: string; noIndex?: boolean } = {},
) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousTitle = document.title;
    const existingMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
    const previousDescription = existingMeta?.getAttribute("content");
    const existingCanonical = document.head.querySelector<HTMLLinkElement>(canonicalSelector);
    const previousCanonical = existingCanonical?.getAttribute("href");
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.getAttribute("content");
    let createdMeta = false;
    let createdCanonical = false;
    let createdRobots = false;

    document.title = title;

    let metaTag = existingMeta;
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.setAttribute("name", "description");
      document.head.appendChild(metaTag);
      createdMeta = true;
    }

    if (description) {
      metaTag.setAttribute("content", description);
    }

    if (options.canonicalPath) {
      const canonical = new URL(options.canonicalPath, window.location.origin).href;
      let canonicalTag = existingCanonical;
      if (!canonicalTag) {
        canonicalTag = document.createElement("link");
        canonicalTag.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalTag);
        createdCanonical = true;
      }
      canonicalTag.setAttribute("href", canonical);
    }

    if (options.noIndex) {
      let robotsTag = existingRobots;
      if (!robotsTag) {
        robotsTag = document.createElement("meta");
        robotsTag.setAttribute("name", "robots");
        document.head.appendChild(robotsTag);
        createdRobots = true;
      }
      robotsTag.setAttribute("content", "noindex,follow");
    }

    return () => {
      document.title = previousTitle;
      const currentMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
      if (currentMeta) {
        if (createdMeta) {
          currentMeta.remove();
        } else if (previousDescription) {
          currentMeta.setAttribute("content", previousDescription);
        } else {
          currentMeta.removeAttribute("content");
        }
      }

      const currentCanonical = document.head.querySelector<HTMLLinkElement>(canonicalSelector);
      if (createdCanonical) {
        currentCanonical?.remove();
      } else if (currentCanonical && previousCanonical) {
        currentCanonical.setAttribute("href", previousCanonical);
      }

      const currentRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (createdRobots) {
        currentRobots?.remove();
      } else if (currentRobots && previousRobots) {
        currentRobots.setAttribute("content", previousRobots);
      }
    };
  }, [description, options.canonicalPath, options.noIndex, title]);
}
