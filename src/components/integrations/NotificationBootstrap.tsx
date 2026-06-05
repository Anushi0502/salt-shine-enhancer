import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { initializePushNotifications, syncWeeklyNotifications } from "@/lib/notifications";
import {
  hideNativeLaunchSplash,
  isNativeApp,
  MOBILE_ROUTE_EVENT,
  NATIVE_LAUNCH_READY_EVENT,
  normalizeAppRoute,
} from "@/lib/mobile";
import { LIVE_SHOPIFY_QUERY_PREFIXES, primeLiveShopifyData } from "@/lib/shopify-data";
const NotificationBootstrap = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isNativeApp()) {
      return undefined;
    }

    let launchCompleted = false;
    const finishLaunch = () => {
      if (launchCompleted) {
        return;
      }

      launchCompleted = true;
      window.dispatchEvent(new Event(NATIVE_LAUNCH_READY_EVENT));
      void hideNativeLaunchSplash();
    };

    const launchTimeout = window.setTimeout(finishLaunch, 2200);

    void initializePushNotifications();
    void syncWeeklyNotifications();
    void primeLiveShopifyData(queryClient)
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(launchTimeout);
        finishLaunch();
      });

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

    const appStateListener = App.addListener("appStateChange", (event) => {
      if (!event.isActive) {
        return;
      }

      void Promise.all(
        LIVE_SHOPIFY_QUERY_PREFIXES.map((queryKey) =>
          queryClient.refetchQueries({ queryKey: [queryKey], type: "active" }),
        ),
      );
      void syncWeeklyNotifications();
    });

    return () => {
      window.clearTimeout(launchTimeout);
      void appUrlOpenListener.then((handle) => handle.remove());
      void appStateListener.then((handle) => handle.remove());
      window.removeEventListener(MOBILE_ROUTE_EVENT, onRouteEvent as EventListener);
    };
  }, [navigate, queryClient]);

  return null;
};

export default NotificationBootstrap;
