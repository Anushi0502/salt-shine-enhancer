import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ensureMetaPixel, trackMetaPixelPageView } from "@/lib/meta-pixel";

const MetaPixelTracker = () => {
  const location = useLocation();

  useEffect(() => {
    ensureMetaPixel();
    trackMetaPixelPageView();
  }, [location.pathname, location.search]);

  return null;
};

export default MetaPixelTracker;
