import { useEffect } from "react";
import { updateCanonicalLink } from "@/lib/canonical-url";

const metaDescriptionSelector = 'meta[name="description"]';

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
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.getAttribute("content");
    let createdMeta = false;
    let createdRobots = false;
    const cleanupCanonical = options.canonicalPath
      ? updateCanonicalLink(document, options.canonicalPath)
      : undefined;

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
      cleanupCanonical?.();
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

      const currentRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (createdRobots) {
        currentRobots?.remove();
      } else if (currentRobots && previousRobots) {
        currentRobots.setAttribute("content", previousRobots);
      }
    };
  }, [description, options.canonicalPath, options.noIndex, title]);
}
