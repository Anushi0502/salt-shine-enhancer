import { useEffect, useMemo, useState } from "react";
import type { ImgHTMLAttributes, ReactNode, SyntheticEvent } from "react";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: ReactNode;
};

const ResilientImage = ({ src, onError, alt = "", fallback = null, ...rest }: ResilientImageProps) => {
  const initialSrc = useMemo(
    () => normalizeShopifyAssetUrl(src) || "",
    [src],
  );
  const [resolvedSrc, setResolvedSrc] = useState(initialSrc);

  useEffect(() => {
    setResolvedSrc(initialSrc);
  }, [initialSrc]);

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (resolvedSrc) {
      setResolvedSrc("");
    }
    onError?.(event);
  };

  if (!resolvedSrc) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...rest}
      src={resolvedSrc}
      alt={alt}
      onError={handleError}
    />
  );
};

export default ResilientImage;
