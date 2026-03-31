import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

const MetaPixelTracker = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fbq !== "function") {
      return;
    }

    window.fbq("track", "PageView");
  }, [location.pathname, location.search]);

  return null;
};

export default MetaPixelTracker;
