import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { initializePushNotifications } from "@/lib/notifications";
import { isNativeApp, MOBILE_ROUTE_EVENT, normalizeAppRoute } from "@/lib/mobile";

const NotificationBootstrap = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) {
      return undefined;
    }

    void initializePushNotifications();

    const appUrlOpenListener = App.addListener("appUrlOpen", (event) => {
      const route = normalizeAppRoute(event.url);
      if (!route) {
        return;
      }

      navigate(route, { replace: true });
    });

    const onRouteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const route = normalizeAppRoute(customEvent.detail || "/");
      if (!route) {
        return;
      }

      navigate(route, { replace: true });
    };

    window.addEventListener(MOBILE_ROUTE_EVENT, onRouteEvent as EventListener);

    return () => {
      void appUrlOpenListener.then((handle) => handle.remove());
      window.removeEventListener(MOBILE_ROUTE_EVENT, onRouteEvent as EventListener);
    };
  }, [navigate]);

  return null;
};

export default NotificationBootstrap;
