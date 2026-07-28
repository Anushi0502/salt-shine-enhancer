import { useEffect } from "react";

const metaDescriptionSelector = 'meta[name="description"]';

export function useDocumentMetadata(title: string, description?: string) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousTitle = document.title;
    const existingMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
    const previousDescription = existingMeta?.getAttribute("content");
    let createdMeta = false;

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

    return () => {
      document.title = previousTitle;
      const currentMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
      if (!currentMeta) {
        return;
      }

      if (createdMeta) {
        currentMeta.remove();
        return;
      }

      if (previousDescription) {
        currentMeta.setAttribute("content", previousDescription);
      } else {
        currentMeta.removeAttribute("content");
      }
    };
  }, [description, title]);
}
