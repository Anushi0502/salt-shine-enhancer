import { useEffect, useMemo, useRef, useState } from "react";
import type { ImgHTMLAttributes, ReactNode, SyntheticEvent } from "react";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: ReactNode;
  /**
   * Native lazy loading still starts requests several screens before an image is
   * visible. Use this for dense, below-the-fold merchandising grids so their
   * product images do not compete with the first screen.
   */
  deferUntilNearViewport?: boolean;
};

const ResilientImage = ({
  src,
  onError,
  alt = "",
  fallback = null,
  deferUntilNearViewport = false,
  ...rest
}: ResilientImageProps) => {
  const initialSrc = useMemo(
    () => normalizeShopifyAssetUrl(src) || "",
    [src],
  );
  const [resolvedSrc, setResolvedSrc] = useState(initialSrc);
  const [shouldLoad, setShouldLoad] = useState(!deferUntilNearViewport);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setResolvedSrc(initialSrc);
  }, [initialSrc]);

  useEffect(() => {
    if (!deferUntilNearViewport) {
      setShouldLoad(true);
      return;
    }

    const image = imageRef.current;
    if (!image || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "650px 0px" },
    );

    observer.observe(image);
    return () => observer.disconnect();
  }, [deferUntilNearViewport]);

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (resolvedSrc) {
      setResolvedSrc("");
    }
    onError?.(event);
  };

  if (shouldLoad && !resolvedSrc) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...rest}
      ref={imageRef}
      src={shouldLoad ? resolvedSrc : undefined}
      alt={alt}
      onError={handleError}
    />
  );
};

export default ResilientImage;
