import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  hideNativeLaunchSplash,
  isNativeApp,
  MOBILE_ROUTE_EVENT,
  NATIVE_LAUNCH_READY_EVENT,
  normalizeAppRoute,
} from "@/lib/mobile";

async function refreshLiveShopifyData(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  const { LIVE_SHOPIFY_QUERY_PREFIXES, primeLiveShopifyData } = await import("@/lib/shopify-data");

  await primeLiveShopifyData(queryClient);
  await Promise.all(
    LIVE_SHOPIFY_QUERY_PREFIXES.map((queryKey) =>
      queryClient.refetchQueries({ queryKey: [queryKey], type: "active" }),
    ),
  );
}

const NotificationBootstrap = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isNativeApp()) {
      return undefined;
    }

    let cancelled = false;
    let launchCompleted = false;
    const finishLaunch = () => {
      if (cancelled || launchCompleted) {
        return;
      }

      launchCompleted = true;
      window.dispatchEvent(new Event(NATIVE_LAUNCH_READY_EVENT));
      void hideNativeLaunchSplash();
    };

    const launchTimeout = window.setTimeout(finishLaunch, 2200);
    let appUrlOpenListener: Promise<{ remove: () => Promise<void> | void }> | null = null;
    let appStateListener: Promise<{ remove: () => Promise<void> | void }> | null = null;
    const onRouteEvent = (event: Event) => {
      if (cancelled) {
        return;
      }

      const customEvent = event as CustomEvent<string>;
      const route = normalizeAppRoute(customEvent.detail || "/");
      if (!route) {
        return;
      }

      navigate(route, { replace: true });
    };

    window.addEventListener(MOBILE_ROUTE_EVENT, onRouteEvent as EventListener);

    void (async () => {
      const [
        { App },
        { initializePushNotifications, syncWeeklyNotifications },
        { primeLiveShopifyData },
      ] = await Promise.all([
        import("@capacitor/app"),
        import("@/lib/notifications"),
        import("@/lib/shopify-data"),
      ]);

      if (cancelled) {
        return;
      }

      void initializePushNotifications();
      void syncWeeklyNotifications();
      void primeLiveShopifyData(queryClient).catch(() => undefined);
      window.clearTimeout(launchTimeout);
      finishLaunch();

      appUrlOpenListener = App.addListener("appUrlOpen", (event) => {
        const route = normalizeAppRoute(event.url);
        if (!route) {
          return;
        }

        navigate(route, { replace: true });
      });

      appStateListener = App.addListener("appStateChange", (event) => {
        if (!event.isActive || !launchCompleted) {
          return;
        }

        void refreshLiveShopifyData(queryClient).catch(() => undefined);
        void syncWeeklyNotifications();
      });
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearTimeout(launchTimeout);
      void appUrlOpenListener?.then((handle) => handle.remove());
      void appStateListener?.then((handle) => handle.remove());
      window.removeEventListener(MOBILE_ROUTE_EVENT, onRouteEvent as EventListener);
    };
  }, [navigate, queryClient]);

  return null;
};

export default NotificationBootstrap;
