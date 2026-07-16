import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scheduleMetaPixelTask, trackMetaPixelPageView } from "@/lib/meta-pixel";

const MetaPixelTracker = () => {
  const location = useLocation();

  useEffect(() => {
    return scheduleMetaPixelTask(trackMetaPixelPageView);
  }, [location.pathname, location.search]);

  return null;
};

export default MetaPixelTracker;
